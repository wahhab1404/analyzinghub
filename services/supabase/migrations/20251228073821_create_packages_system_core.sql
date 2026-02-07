/*
  # Create Packages System Core Schema
  
  1. New Tables
    - `platform_packages` - Catalog of available packages
    - `package_features` - Feature definitions
    - `package_feature_map` - Maps features to packages
    - `user_entitlements` - Source of truth for user's active package
    - `user_entitlement_audit` - Complete audit trail of package changes
    - `user_limits_cache` - Performance cache for fast entitlement checks
    - `user_role_audit` - Audit trail for role changes
    - `analysis_edits_audit` - Edit history for 5-minute edit window
    - `analysis_followups` - Live analysis updates and index commentary
    - `symbol_watchlists` - Symbol following for Pro+ traders
  
  2. Security
    - Enable RLS on all tables
    - Public read for active packages
    - User read own entitlements
    - Admin-only write for package assignments
  
  3. Helper Functions
    - refresh_user_limits_cache() - Refreshes computed entitlements cache
*/

-- =====================================================
-- 1. PLATFORM PACKAGES (CATALOG)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.platform_packages (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.platform_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active public packages"
  ON public.platform_packages FOR SELECT
  USING (is_active = true AND is_public = true);

CREATE POLICY "Admins can view all packages"
  ON public.platform_packages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can insert packages"
  ON public.platform_packages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can update packages"
  ON public.platform_packages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can delete packages"
  ON public.platform_packages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 2. PACKAGE FEATURES (FEATURE DEFINITIONS)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.package_features (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.package_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view features"
  ON public.package_features FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert features"
  ON public.package_features FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can update features"
  ON public.package_features FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can delete features"
  ON public.package_features FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 3. PACKAGE FEATURE MAP
-- =====================================================

CREATE TABLE IF NOT EXISTS public.package_feature_map (
  package_key text REFERENCES public.platform_packages(key) ON DELETE CASCADE,
  feature_key text REFERENCES public.package_features(key) ON DELETE CASCADE,
  value_json jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (package_key, feature_key)
);

ALTER TABLE public.package_feature_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature mappings"
  ON public.package_feature_map FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_packages pp
      WHERE pp.key = package_key
      AND pp.is_active = true
      AND pp.is_public = true
    )
  );

CREATE POLICY "Admins can view all mappings"
  ON public.package_feature_map FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can insert mappings"
  ON public.package_feature_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can update mappings"
  ON public.package_feature_map FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can delete mappings"
  ON public.package_feature_map FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 4. USER ENTITLEMENTS (SOURCE OF TRUTH)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  package_key text REFERENCES public.platform_packages(key) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  assigned_by uuid REFERENCES auth.users(id),
  assign_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_id ON public.user_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_package_key ON public.user_entitlements(package_key);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_status ON public.user_entitlements(status);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entitlements"
  ON public.user_entitlements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all entitlements"
  ON public.user_entitlements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can insert entitlements"
  ON public.user_entitlements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can update entitlements"
  ON public.user_entitlements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can delete entitlements"
  ON public.user_entitlements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 5. USER ENTITLEMENT AUDIT
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_entitlement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  old_package_key text,
  new_package_key text,
  action text NOT NULL CHECK (action IN ('assign', 'upgrade', 'downgrade', 'suspend', 'resume', 'expire')),
  performed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_entitlement_audit_user_id ON public.user_entitlement_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entitlement_audit_created_at ON public.user_entitlement_audit(created_at DESC);

ALTER TABLE public.user_entitlement_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view entitlement audit"
  ON public.user_entitlement_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can insert entitlement audit"
  ON public.user_entitlement_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 6. USER LIMITS CACHE (PERFORMANCE)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_limits_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  package_key text NOT NULL,
  follow_analyzers_limit int,
  telegram_channels_limit int DEFAULT 0,
  publish_limit_per_day int,
  can_follow_symbols boolean DEFAULT false,
  can_export boolean DEFAULT false,
  can_telegram_alerts boolean DEFAULT false,
  can_live_index_read boolean DEFAULT false,
  can_publish_analyses boolean DEFAULT false,
  can_live_analysis_mode boolean DEFAULT false,
  can_extended_targets boolean DEFAULT false,
  can_edit_5min boolean DEFAULT false,
  has_elite_badge boolean DEFAULT false,
  has_private_support boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_limits_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own limits cache"
  ON public.user_limits_cache FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can update cache"
  ON public.user_limits_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 7. USER ROLE AUDIT
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  old_role_name text,
  new_role_name text NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_role_audit_user_id ON public.user_role_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_audit_created_at ON public.user_role_audit(created_at DESC);

ALTER TABLE public.user_role_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view role audit"
  ON public.user_role_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Only admins can insert role audit"
  ON public.user_role_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name IN ('admin', 'super_admin')
    )
  );

-- =====================================================
-- 8. ANALYSIS EDITS AUDIT (5-MIN EDIT WINDOW)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.analysis_edits_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE NOT NULL,
  editor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at timestamptz DEFAULT now(),
  edit_note text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_edits_audit_analysis_id ON public.analysis_edits_audit(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_edits_audit_edited_at ON public.analysis_edits_audit(edited_at DESC);

ALTER TABLE public.analysis_edits_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analysts can view own analysis edits"
  ON public.analysis_edits_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = analysis_id
      AND a.analyzer_id = auth.uid()
    )
  );

CREATE POLICY "Public can view edit metadata for public analyses"
  ON public.analysis_edits_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = analysis_id
      AND a.visibility = 'public'
    )
  );

CREATE POLICY "Service role can insert edits"
  ON public.analysis_edits_audit FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =====================================================
-- 9. ANALYSIS FOLLOWUPS (LIVE UPDATES)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.analysis_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES public.analyses(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('analysis_update', 'spx_live', 'ndx_live')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_followups_analysis_id ON public.analysis_followups(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_followups_author_id ON public.analysis_followups(author_id);
CREATE INDEX IF NOT EXISTS idx_analysis_followups_type ON public.analysis_followups(type);
CREATE INDEX IF NOT EXISTS idx_analysis_followups_created_at ON public.analysis_followups(created_at DESC);

ALTER TABLE public.analysis_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read access to followups based on type and entitlements"
  ON public.analysis_followups FOR SELECT
  TO authenticated
  USING (
    CASE 
      WHEN analysis_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM public.analyses a
          WHERE a.id = analysis_id
          AND (
            a.visibility = 'public'
            OR a.analyzer_id = auth.uid()
            OR (a.visibility = 'followers' AND EXISTS (
              SELECT 1 FROM public.follows f
              WHERE f.follower_id = auth.uid()
              AND f.following_id = a.analyzer_id
            ))
            OR (a.visibility = 'subscribers' AND EXISTS (
              SELECT 1 FROM public.subscriptions s
              WHERE s.subscriber_id = auth.uid()
              AND s.analyst_id = a.analyzer_id
              AND s.status = 'active'
            ))
          )
        )
      WHEN type IN ('spx_live', 'ndx_live') THEN
        EXISTS (
          SELECT 1 FROM public.user_limits_cache ulc
          WHERE ulc.user_id = auth.uid()
          AND ulc.can_live_index_read = true
        )
      ELSE false
    END
  );

CREATE POLICY "Analyzer Pro/Elite can create followups"
  ON public.analysis_followups FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_limits_cache ulc
      WHERE ulc.user_id = auth.uid()
      AND ulc.can_live_analysis_mode = true
    )
  );

-- =====================================================
-- 10. SYMBOL WATCHLISTS (PRO TRADER+)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.symbol_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_symbol_watchlists_user_id ON public.symbol_watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_symbol_watchlists_symbol ON public.symbol_watchlists(symbol);

ALTER TABLE public.symbol_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist"
  ON public.symbol_watchlists FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Pro+ users can insert to watchlist"
  ON public.symbol_watchlists FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_limits_cache ulc
      WHERE ulc.user_id = auth.uid()
      AND ulc.can_follow_symbols = true
    )
  );

CREATE POLICY "Pro+ users can update watchlist"
  ON public.symbol_watchlists FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_limits_cache ulc
      WHERE ulc.user_id = auth.uid()
      AND ulc.can_follow_symbols = true
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_limits_cache ulc
      WHERE ulc.user_id = auth.uid()
      AND ulc.can_follow_symbols = true
    )
  );

CREATE POLICY "Pro+ users can delete from watchlist"
  ON public.symbol_watchlists FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_limits_cache ulc
      WHERE ulc.user_id = auth.uid()
      AND ulc.can_follow_symbols = true
    )
  );

-- =====================================================
-- 11. ADD EXTENDED TARGETS TO ANALYSES
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'analyses'
    AND column_name = 'extended_targets'
  ) THEN
    ALTER TABLE public.analyses ADD COLUMN extended_targets jsonb DEFAULT '[]';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'analyses'
    AND column_name = 'is_edited'
  ) THEN
    ALTER TABLE public.analyses ADD COLUMN is_edited boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'analyses'
    AND column_name = 'last_edited_at'
  ) THEN
    ALTER TABLE public.analyses ADD COLUMN last_edited_at timestamptz;
  END IF;
END $$;

-- =====================================================
-- 12. ADD TIER TO TELEGRAM CHANNELS
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'telegram_channels'
    AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.telegram_channels ADD COLUMN tier text CHECK (tier IN ('lite', 'pro', 'signals', 'live'));
  END IF;
END $$;

-- =====================================================
-- 13. HELPER FUNCTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION public.refresh_user_limits_cache(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_package_key text;
  v_entitlement_status text;
  v_role_name text;
  v_limits record;
BEGIN
  SELECT ue.package_key, ue.status, r.name
  INTO v_package_key, v_entitlement_status, v_role_name
  FROM public.user_entitlements ue
  LEFT JOIN public.profiles p ON p.id = p_user_id
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE ue.user_id = p_user_id
  AND ue.status = 'active'
  AND (ue.expires_at IS NULL OR ue.expires_at > now());
  
  IF v_package_key IS NULL THEN
    v_package_key := 'free_trader';
  END IF;
  
  IF v_role_name IS NULL THEN
    SELECT r.name INTO v_role_name
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id;
  END IF;
  
  CASE v_package_key
    WHEN 'free_trader' THEN
      v_limits := ROW(
        50, 0, NULL,
        false, false, false, false, false, false, false, false, false, false
      );
    WHEN 'pro_trader' THEN
      v_limits := ROW(
        NULL, 0, NULL,
        true, true, true, true, false, false, false, false, false, false
      );
    WHEN 'analyzer_pro' THEN
      v_limits := ROW(
        NULL, 2, 20,
        true, true, true, true,
        CASE WHEN v_role_name = 'analyzer' THEN true ELSE false END,
        true, true, true, false, false
      );
    WHEN 'analyzer_elite' THEN
      v_limits := ROW(
        NULL, 4, NULL,
        true, true, true, true,
        CASE WHEN v_role_name = 'analyzer' THEN true ELSE false END,
        true, true, true, true, true
      );
    ELSE
      v_limits := ROW(
        50, 0, NULL,
        false, false, false, false, false, false, false, false, false, false
      );
  END CASE;
  
  INSERT INTO public.user_limits_cache (
    user_id, package_key,
    follow_analyzers_limit, telegram_channels_limit, publish_limit_per_day,
    can_follow_symbols, can_export, can_telegram_alerts, can_live_index_read,
    can_publish_analyses, can_live_analysis_mode, can_extended_targets,
    can_edit_5min, has_elite_badge, has_private_support,
    updated_at
  )
  VALUES (
    p_user_id, v_package_key,
    v_limits.f1, v_limits.f2, v_limits.f3,
    v_limits.f4, v_limits.f5, v_limits.f6, v_limits.f7,
    v_limits.f8, v_limits.f9, v_limits.f10,
    v_limits.f11, v_limits.f12, v_limits.f13,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    package_key = EXCLUDED.package_key,
    follow_analyzers_limit = EXCLUDED.follow_analyzers_limit,
    telegram_channels_limit = EXCLUDED.telegram_channels_limit,
    publish_limit_per_day = EXCLUDED.publish_limit_per_day,
    can_follow_symbols = EXCLUDED.can_follow_symbols,
    can_export = EXCLUDED.can_export,
    can_telegram_alerts = EXCLUDED.can_telegram_alerts,
    can_live_index_read = EXCLUDED.can_live_index_read,
    can_publish_analyses = EXCLUDED.can_publish_analyses,
    can_live_analysis_mode = EXCLUDED.can_live_analysis_mode,
    can_extended_targets = EXCLUDED.can_extended_targets,
    can_edit_5min = EXCLUDED.can_edit_5min,
    has_elite_badge = EXCLUDED.has_elite_badge,
    has_private_support = EXCLUDED.has_private_support,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_refresh_user_limits_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  PERFORM public.refresh_user_limits_cache(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_limits_cache_on_entitlement_change ON public.user_entitlements;
CREATE TRIGGER refresh_limits_cache_on_entitlement_change
  AFTER INSERT OR UPDATE ON public.user_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_refresh_user_limits_cache();

CREATE OR REPLACE FUNCTION public.trigger_refresh_limits_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    PERFORM public.refresh_user_limits_cache(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_limits_cache_on_profile_change ON public.profiles;
CREATE TRIGGER refresh_limits_cache_on_profile_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_refresh_limits_on_profile_change();
