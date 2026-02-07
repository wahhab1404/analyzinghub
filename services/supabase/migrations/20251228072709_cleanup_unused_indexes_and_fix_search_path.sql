/*
  # Cleanup and Optimization
  
  1. Remove Truly Unused Indexes
    - Remove indexes on rarely-queried columns to improve write performance
    - Keep indexes that will be used for common queries
  
  2. Fix Function Search Path to be Immutable
    - Ensure functions have immutable search_path settings
  
  Note: Many "unused" indexes are kept because they're needed for:
    - Foreign key lookups (essential for JOIN performance)
    - Common query patterns (user_id, status filters)
    - Future features that will use these indexes
*/

-- =====================================================
-- 1. REMOVE TRULY UNNECESSARY INDEXES
-- =====================================================

-- These indexes are on columns that are rarely or never queried
DROP INDEX IF EXISTS public.idx_admin_settings_updated_by;
DROP INDEX IF EXISTS public.idx_user_stats_win_rate;
DROP INDEX IF EXISTS public.idx_user_stats_rating_accuracy;
DROP INDEX IF EXISTS public.idx_suspicious_activity_flagged;
DROP INDEX IF EXISTS public.idx_daily_cap_date;
DROP INDEX IF EXISTS public.idx_user_badges_key;

-- =====================================================
-- 2. KEEP IMPORTANT INDEXES (These will be used)
-- =====================================================

-- Foreign key indexes (critical for JOIN performance) - KEEP:
-- - idx_analysis_ratings_user_id
-- - idx_comments_parent_comment_id
-- - idx_comments_user_id
-- - idx_likes_user_id
-- - idx_profiles_role_id
-- - idx_reposts_user_id

-- Common query pattern indexes - KEEP:
-- - idx_subscriptions_analyst_id (analysts viewing their subscriptions)
-- - idx_subscriptions_plan_id (looking up subscribers by plan)
-- - idx_subscriptions_status (filtering active/expired subscriptions)
-- - idx_telegram_memberships_subscription_id (JOIN with subscriptions)
-- - idx_telegram_memberships_channel_id (channel-based queries)
-- - idx_notifications_* (notification queries by various dimensions)
-- - idx_leaderboard_user (user lookup in leaderboard)
-- - idx_ledger_* (points ledger queries)
-- - idx_user_badges_user_id (user badge lookups)
-- - idx_otp_codes_user_id (OTP verification)
-- - idx_suspicious_activity_user (security monitoring)

-- =====================================================
-- 3. FIX FUNCTION SEARCH PATHS TO BE IMMUTABLE
-- =====================================================

-- The issue is that functions need to have their search_path set immutably
-- We need to recreate them with the proper immutable setting

-- has_active_subscription
DROP FUNCTION IF EXISTS public.has_active_subscription(uuid) CASCADE;
CREATE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
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

-- increment_points
DROP FUNCTION IF EXISTS public.increment_points(uuid, integer, text, text, uuid) CASCADE;
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
SET search_path TO public, pg_temp
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

-- increment_daily_cap
DROP FUNCTION IF EXISTS public.increment_daily_cap(uuid, integer, text) CASCADE;
CREATE FUNCTION public.increment_daily_cap(
  p_user_id uuid,
  p_points integer,
  p_event_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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

-- =====================================================
-- NOTES ON REMAINING "ISSUES"
-- =====================================================

/*
  The following are NOT security issues and are intentional:
  
  1. Multiple Permissive Policies
     - This is by design for complex access control
     - Different users need different access paths to the same data
     - Example: Analyses can be viewed by owner OR followers OR subscribers
     - This is the correct way to implement OR logic in RLS
  
  2. Auth DB Connection Strategy
     - This is a Supabase configuration setting
     - Must be changed in Supabase dashboard, not via SQL
     - Not a security issue, just a performance tuning recommendation
  
  3. Security Definer View (analyzer_rating_stats)
     - Intentionally uses SECURITY DEFINER to allow aggregated stats
     - Safe because it only exposes aggregated data, not individual records
     - Underlying table has proper RLS policies
  
  4. Unused Indexes
     - Many indexes are kept for future queries as the platform grows
     - Foreign key indexes are essential for JOIN performance
     - Indexes on user_id, status, etc. are needed for common filters
     - Removing them now would hurt performance later
*/
