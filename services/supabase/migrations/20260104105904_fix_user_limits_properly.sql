/*
  # Fix User Limits Cache to Use Correct Table
  
  Use user_entitlements table instead of non-existent analyzer_plans
*/

CREATE OR REPLACE FUNCTION public.refresh_user_limits_cache(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_package_key TEXT;
  v_role_name TEXT;
  v_limits RECORD;
BEGIN
  -- Get user's role
  SELECT r.name INTO v_role_name
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = p_user_id;

  -- Get user's current package from entitlements
  SELECT ue.package_key INTO v_package_key
  FROM public.user_entitlements ue
  WHERE ue.user_id = p_user_id
  AND ue.status = 'active'
  AND (ue.expires_at IS NULL OR ue.expires_at > now())
  ORDER BY ue.created_at DESC
  LIMIT 1;

  -- Default to free_trader if no active entitlement
  IF v_package_key IS NULL THEN
    v_package_key := 'free_trader';
  END IF;

  -- Set limits based on package
  CASE v_package_key
    WHEN 'free_trader' THEN
      v_limits := ROW(
        50::INTEGER, 0::INTEGER, NULL::INTEGER,
        false, false, false, false, false, false, false, false, false, false
      );
    WHEN 'pro_trader' THEN
      v_limits := ROW(
        NULL::INTEGER, 0::INTEGER, NULL::INTEGER,
        true, true, true, true, false, false, false, false, false, false
      );
    WHEN 'analyzer_pro' THEN
      v_limits := ROW(
        NULL::INTEGER, 2::INTEGER, 20::INTEGER,
        true, true, true, true,
        CASE WHEN v_role_name IN ('Analyzer', 'SuperAdmin') THEN true ELSE false END,
        true, true, true, false, false
      );
    WHEN 'analyzer_elite' THEN
      v_limits := ROW(
        NULL::INTEGER, 4::INTEGER, NULL::INTEGER,
        true, true, true, true,
        CASE WHEN v_role_name IN ('Analyzer', 'SuperAdmin') THEN true ELSE false END,
        true, true, true, true, true
      );
    ELSE
      v_limits := ROW(
        50::INTEGER, 0::INTEGER, NULL::INTEGER,
        false, false, false, false, false, false, false, false, false, false
      );
  END CASE;

  -- Upsert into cache with explicit types
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
    (v_limits.f1)::INTEGER, (v_limits.f2)::INTEGER, (v_limits.f3)::INTEGER,
    (v_limits.f4)::BOOLEAN, (v_limits.f5)::BOOLEAN, (v_limits.f6)::BOOLEAN, (v_limits.f7)::BOOLEAN,
    (v_limits.f8)::BOOLEAN, (v_limits.f9)::BOOLEAN, (v_limits.f10)::BOOLEAN,
    (v_limits.f11)::BOOLEAN, (v_limits.f12)::BOOLEAN, (v_limits.f13)::BOOLEAN,
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
