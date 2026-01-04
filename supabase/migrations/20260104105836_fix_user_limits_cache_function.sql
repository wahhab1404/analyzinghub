/*
  # Fix User Limits Cache Function
  
  The trigger is failing due to type conversion issues.
  Let's fix the refresh_user_limits_cache function.
*/

-- Drop and recreate the function with proper type casting
CREATE OR REPLACE FUNCTION public.refresh_user_limits_cache(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_package_key TEXT;
  v_limits RECORD;
BEGIN
  -- Get user's current package
  SELECT ap.package_key INTO v_package_key
  FROM analyzer_plans ap
  WHERE ap.user_id = p_user_id
  AND ap.status = 'active'
  AND ap.expires_at > now()
  ORDER BY ap.created_at DESC
  LIMIT 1;

  -- If no active package, use 'free'
  IF v_package_key IS NULL THEN
    v_package_key := 'free';
  END IF;

  -- Get package limits with explicit casting
  SELECT
    COALESCE(follow_analyzers_limit, 0)::INTEGER as f1,
    COALESCE(telegram_channels_limit, 0)::INTEGER as f2,
    COALESCE(publish_limit_per_day, 0)::INTEGER as f3,
    COALESCE(can_follow_symbols, false)::BOOLEAN as f4,
    COALESCE(can_export, false)::BOOLEAN as f5,
    COALESCE(can_telegram_alerts, false)::BOOLEAN as f6,
    COALESCE(can_live_index_read, false)::BOOLEAN as f7,
    COALESCE(can_publish_analyses, false)::BOOLEAN as f8,
    COALESCE(can_live_analysis_mode, false)::BOOLEAN as f9,
    COALESCE(can_extended_targets, false)::BOOLEAN as f10,
    COALESCE(can_edit_5min, false)::BOOLEAN as f11,
    COALESCE(has_elite_badge, false)::BOOLEAN as f12,
    COALESCE(has_private_support, false)::BOOLEAN as f13
  INTO v_limits
  FROM packages
  WHERE package_key = v_package_key;

  -- If package not found, use defaults
  IF NOT FOUND THEN
    v_limits := ROW(5, 1, 10, false, false, false, false, true, false, false, false, false, false);
  END IF;

  -- Upsert into cache
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
    v_limits.f1::INTEGER, v_limits.f2::INTEGER, v_limits.f3::INTEGER,
    v_limits.f4::BOOLEAN, v_limits.f5::BOOLEAN, v_limits.f6::BOOLEAN, v_limits.f7::BOOLEAN,
    v_limits.f8::BOOLEAN, v_limits.f9::BOOLEAN, v_limits.f10::BOOLEAN,
    v_limits.f11::BOOLEAN, v_limits.f12::BOOLEAN, v_limits.f13::BOOLEAN,
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
