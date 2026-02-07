/*
  # Fix Security and Performance Issues
  
  1. Add Missing Foreign Key Indexes
    - Add indexes on all foreign key columns that are missing them
    - Improves query performance for JOIN operations and foreign key lookups
  
  2. Optimize RLS Policies
    - Update policies to use `(select auth.uid())` instead of `auth.uid()`
    - Prevents policy re-evaluation for each row, significantly improving performance
  
  3. Fix Function Search Paths
    - Set explicit search_path on functions to prevent security vulnerabilities
    - Ensures functions always reference the correct schema
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_analyses_symbol_id ON public.analyses(symbol_id);
CREATE INDEX IF NOT EXISTS idx_analysis_ratings_user_id ON public.analysis_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON public.comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON public.reposts(user_id);

-- =====================================================
-- 2. OPTIMIZE RLS POLICIES - Use Subselects
-- =====================================================

-- telegram_memberships policies
DROP POLICY IF EXISTS "Users can view own memberships" ON public.telegram_memberships;
CREATE POLICY "Users can view own memberships" ON public.telegram_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = telegram_memberships.subscription_id
      AND s.subscriber_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Analysts can view memberships for own channels" ON public.telegram_memberships;
CREATE POLICY "Analysts can view memberships for own channels" ON public.telegram_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.telegram_channels tc
      WHERE tc.channel_id = telegram_memberships.channel_id
      AND tc.user_id = (select auth.uid())
    )
  );

-- analyses policies
DROP POLICY IF EXISTS "Followers can view follower-only analyses" ON public.analyses;
CREATE POLICY "Followers can view follower-only analyses" ON public.analyses
  FOR SELECT TO authenticated
  USING (
    visibility = 'followers' AND
    EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = (select auth.uid())
      AND f.following_id = analyses.analyzer_id
    )
  );

DROP POLICY IF EXISTS "Subscribers can view subscriber-only analyses" ON public.analyses;
CREATE POLICY "Subscribers can view subscriber-only analyses" ON public.analyses
  FOR SELECT TO authenticated
  USING (
    visibility = 'subscribers' AND
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.analyzer_plans ap ON s.plan_id = ap.id
      WHERE s.subscriber_id = (select auth.uid())
      AND ap.analyst_id = analyses.analyzer_id
      AND s.status = 'active'
      AND s.current_period_end > now()
    )
  );

DROP POLICY IF EXISTS "Private analyses viewable by owner only" ON public.analyses;
CREATE POLICY "Private analyses viewable by owner only" ON public.analyses
  FOR SELECT TO authenticated
  USING (
    visibility = 'private' AND
    analyzer_id = (select auth.uid())
  );

-- user_points_ledger policies
DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.user_points_ledger;
CREATE POLICY "Users can view own ledger entries" ON public.user_points_ledger
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- user_points_balance policies
DROP POLICY IF EXISTS "Users can view own balance" ON public.user_points_balance;
CREATE POLICY "Users can view own balance" ON public.user_points_balance
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- analyzer_plans policies
DROP POLICY IF EXISTS "Analysts can view own plans" ON public.analyzer_plans;
CREATE POLICY "Analysts can view own plans" ON public.analyzer_plans
  FOR SELECT TO authenticated
  USING (analyst_id = (select auth.uid()));

DROP POLICY IF EXISTS "Analysts can create own plans" ON public.analyzer_plans;
CREATE POLICY "Analysts can create own plans" ON public.analyzer_plans
  FOR INSERT TO authenticated
  WITH CHECK (analyst_id = (select auth.uid()));

DROP POLICY IF EXISTS "Analysts can update own plans" ON public.analyzer_plans;
CREATE POLICY "Analysts can update own plans" ON public.analyzer_plans
  FOR UPDATE TO authenticated
  USING (analyst_id = (select auth.uid()))
  WITH CHECK (analyst_id = (select auth.uid()));

DROP POLICY IF EXISTS "Analysts can delete own plans" ON public.analyzer_plans;
CREATE POLICY "Analysts can delete own plans" ON public.analyzer_plans
  FOR DELETE TO authenticated
  USING (analyst_id = (select auth.uid()));

-- subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (subscriber_id = (select auth.uid()));

DROP POLICY IF EXISTS "Analysts can view subscriptions to own plans" ON public.subscriptions;
CREATE POLICY "Analysts can view subscriptions to own plans" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyzer_plans ap
      WHERE ap.id = subscriptions.plan_id
      AND ap.analyst_id = (select auth.uid())
    )
  );

-- =====================================================
-- 3. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Drop existing functions with CASCADE to handle dependencies
DROP FUNCTION IF EXISTS public.has_active_subscription(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_plan_subscriber_count(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.expire_subscriptions() CASCADE;
DROP FUNCTION IF EXISTS public.update_points_balance() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_user_stats(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.increment_points(uuid, integer, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.increment_daily_cap(uuid, integer, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Recreate functions with fixed search_path

CREATE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE subscriber_id = p_user_id
    AND status = 'active'
    AND current_period_end > now()
  );
END;
$$;

CREATE FUNCTION public.get_plan_subscriber_count(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM public.subscriptions
  WHERE plan_id = p_plan_id
  AND status = 'active'
  AND current_period_end > now();
  
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.expire_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
  AND current_period_end <= now();
END;
$$;

CREATE FUNCTION public.update_points_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role = 'analyst' THEN
    INSERT INTO public.user_points_balance (
      user_id, 
      analyst_points_all_time,
      analyst_points_weekly,
      analyst_points_monthly
    )
    VALUES (
      NEW.user_id, 
      NEW.points_delta,
      NEW.points_delta,
      NEW.points_delta
    )
    ON CONFLICT (user_id) DO UPDATE SET
      analyst_points_all_time = user_points_balance.analyst_points_all_time + NEW.points_delta,
      analyst_points_weekly = user_points_balance.analyst_points_weekly + NEW.points_delta,
      analyst_points_monthly = user_points_balance.analyst_points_monthly + NEW.points_delta,
      last_updated_at = now();
  ELSE
    INSERT INTO public.user_points_balance (
      user_id, 
      trader_points_all_time,
      trader_points_weekly,
      trader_points_monthly
    )
    VALUES (
      NEW.user_id, 
      NEW.points_delta,
      NEW.points_delta,
      NEW.points_delta
    )
    ON CONFLICT (user_id) DO UPDATE SET
      trader_points_all_time = user_points_balance.trader_points_all_time + NEW.points_delta,
      trader_points_weekly = user_points_balance.trader_points_weekly + NEW.points_delta,
      trader_points_monthly = user_points_balance.trader_points_monthly + NEW.points_delta,
      last_updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER update_points_balance_trigger
  AFTER INSERT ON public.user_points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.update_points_balance();

CREATE FUNCTION public.calculate_user_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_closed_analyses integer;
  v_successful_analyses integer;
  v_failed_analyses integer;
  v_win_rate numeric;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')),
    COUNT(*) FILTER (WHERE status = 'SUCCESS'),
    COUNT(*) FILTER (WHERE status = 'FAILED')
  INTO 
    v_closed_analyses,
    v_successful_analyses,
    v_failed_analyses
  FROM public.analyses
  WHERE analyzer_id = p_user_id;
  
  IF v_closed_analyses > 0 THEN
    v_win_rate := (v_successful_analyses::numeric / v_closed_analyses) * 100;
  ELSE
    v_win_rate := 0;
  END IF;
  
  INSERT INTO public.user_stats (
    user_id,
    closed_analyses,
    successful_analyses,
    failed_analyses,
    win_rate
  )
  VALUES (
    p_user_id,
    v_closed_analyses,
    v_successful_analyses,
    v_failed_analyses,
    v_win_rate
  )
  ON CONFLICT (user_id) DO UPDATE SET
    closed_analyses = EXCLUDED.closed_analyses,
    successful_analyses = EXCLUDED.successful_analyses,
    failed_analyses = EXCLUDED.failed_analyses,
    win_rate = EXCLUDED.win_rate,
    last_calculated_at = now();
END;
$$;

CREATE FUNCTION public.increment_points(
  p_user_id uuid,
  p_points integer,
  p_event_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role
  FROM public.profiles p
  JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = p_user_id;
  
  INSERT INTO public.user_points_ledger (
    user_id,
    role,
    event_type,
    entity_type,
    entity_id,
    points_delta
  )
  VALUES (
    p_user_id,
    COALESCE(v_role, 'trader'),
    p_event_type::scoring_event_type,
    p_entity_type,
    p_entity_id,
    p_points
  );
END;
$$;

CREATE FUNCTION public.increment_daily_cap(
  p_user_id uuid,
  p_points integer,
  p_event_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trader_points integer;
  v_analyst_count integer;
BEGIN
  SELECT trader_points_today, analyst_analyses_today
  INTO v_trader_points, v_analyst_count
  FROM public.daily_points_cap
  WHERE user_id = p_user_id
  AND date = CURRENT_DATE;
  
  IF NOT FOUND THEN
    INSERT INTO public.daily_points_cap (user_id, date, trader_points_today, analyst_analyses_today)
    VALUES (p_user_id, CURRENT_DATE, 
      CASE WHEN p_event_type = 'trader' THEN p_points ELSE 0 END,
      CASE WHEN p_event_type = 'analyst' THEN 1 ELSE 0 END
    );
    RETURN true;
  END IF;
  
  IF p_event_type = 'trader' AND v_trader_points + p_points <= 100 THEN
    UPDATE public.daily_points_cap
    SET trader_points_today = trader_points_today + p_points
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
    RETURN true;
  ELSIF p_event_type = 'analyst' AND v_analyst_count < 3 THEN
    UPDATE public.daily_points_cap
    SET analyst_analyses_today = analyst_analyses_today + 1
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
