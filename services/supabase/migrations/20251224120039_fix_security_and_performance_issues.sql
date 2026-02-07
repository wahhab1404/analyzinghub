/*
  # Fix Security and Performance Issues

  ## Changes Made

  ### 1. Critical Security Fixes
  - Add missing index on `otp_codes.user_id` foreign key for optimal query performance
  - Optimize RLS policies on `otp_codes` to prevent re-evaluation of auth functions per row
  - Fix function search path for `update_otp_updated_at` to prevent security vulnerabilities
  - Fix SECURITY DEFINER view issue by recreating without security definer

  ### 2. Performance Optimization
  - Drop 38 unused indexes that were identified by database analysis
  - These unused indexes slow down INSERT/UPDATE operations without providing query benefits

  ### 3. Materialized View Security
  - Revoke direct SELECT access to materialized views from anon/authenticated roles
  - Application code should control access to this data through API endpoints
  - Materialized views remain accessible to service role for refreshes

  ## Important Notes
  - **Auth Connection Strategy**: Must be configured in Supabase Dashboard
  - **Leaked Password Protection**: Must be enabled in Auth settings in Supabase Dashboard
  - **Materialized Views**: Access should be controlled at the application layer through API routes
*/

-- =====================================================
-- 1. ADD MISSING INDEX FOR FOREIGN KEY
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id ON public.otp_codes(user_id);

-- =====================================================
-- 2. FIX RLS POLICIES TO USE SELECT OPTIMIZATION
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own OTP codes" ON public.otp_codes;
DROP POLICY IF EXISTS "Users can update own OTP codes" ON public.otp_codes;

-- Recreate with optimized auth function calls
CREATE POLICY "Users can read own OTP codes"
  ON public.otp_codes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own OTP codes"
  ON public.otp_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =====================================================
-- 3. DROP UNUSED INDEXES
-- =====================================================

-- Drop all unused indexes identified in the security scan
DROP INDEX IF EXISTS idx_profiles_role_id;
DROP INDEX IF EXISTS idx_comments_user_id;
DROP INDEX IF EXISTS idx_engagement_events_entity;
DROP INDEX IF EXISTS idx_saves_analysis_id;
DROP INDEX IF EXISTS idx_saves_user_id;
DROP INDEX IF EXISTS idx_reposts_user_id;
DROP INDEX IF EXISTS idx_trending_analyses_last;
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_price_snapshots_symbol_timestamp;
DROP INDEX IF EXISTS idx_validation_events_hit_at;
DROP INDEX IF EXISTS idx_user_symbol_affinity_symbol;
DROP INDEX IF EXISTS idx_user_analyzer_affinity_analyzer;
DROP INDEX IF EXISTS idx_comments_parent_comment_id;
DROP INDEX IF EXISTS idx_analysis_ratings_user;
DROP INDEX IF EXISTS idx_notifications_actor_id;
DROP INDEX IF EXISTS idx_notifications_comment_id;
DROP INDEX IF EXISTS idx_telegram_accounts_user_id;
DROP INDEX IF EXISTS idx_telegram_accounts_chat_id;
DROP INDEX IF EXISTS idx_telegram_link_codes_code;
DROP INDEX IF EXISTS idx_notification_delivery_log_notification_id;
DROP INDEX IF EXISTS idx_notification_delivery_log_user_id;
DROP INDEX IF EXISTS idx_notification_delivery_log_status;
DROP INDEX IF EXISTS idx_notification_delivery_log_created_at;
DROP INDEX IF EXISTS idx_telegram_channels_channel_id;
DROP INDEX IF EXISTS idx_channel_broadcast_log_channel_id;
DROP INDEX IF EXISTS idx_channel_broadcast_log_user_id;
DROP INDEX IF EXISTS idx_channel_broadcast_log_analysis_id;
DROP INDEX IF EXISTS idx_channel_broadcast_log_created_at;
DROP INDEX IF EXISTS idx_admin_settings_key;
DROP INDEX IF EXISTS idx_admin_settings_updated_by;
DROP INDEX IF EXISTS idx_analyses_symbol_id;
DROP INDEX IF EXISTS idx_likes_user_id;
DROP INDEX IF EXISTS idx_notifications_analysis_id;
DROP INDEX IF EXISTS idx_notifications_parent_comment_id;
DROP INDEX IF EXISTS idx_otp_codes_email;
DROP INDEX IF EXISTS idx_otp_codes_expires_at;
DROP INDEX IF EXISTS idx_otp_codes_verified;
DROP INDEX IF EXISTS idx_profiles_language;

-- =====================================================
-- 4. FIX FUNCTION SEARCH PATH
-- =====================================================

-- Recreate function with explicit schema references to prevent search_path attacks
CREATE OR REPLACE FUNCTION public.update_otp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =====================================================
-- 5. FIX SECURITY DEFINER VIEW
-- =====================================================

-- Drop and recreate view without SECURITY DEFINER (if it exists)
DROP VIEW IF EXISTS public.analyzer_rating_stats CASCADE;

-- Create view based on analysis_ratings table
-- Note: Ratings are per analysis, so we aggregate by the analyzer (analysis creator)
CREATE VIEW public.analyzer_rating_stats AS
SELECT 
  a.analyzer_id,
  COUNT(*) as rating_count,
  AVG(ar.rating) as average_rating,
  SUM(CASE WHEN ar.rating >= 9 THEN 1 ELSE 0 END) as five_star_count,
  SUM(CASE WHEN ar.rating >= 7 AND ar.rating < 9 THEN 1 ELSE 0 END) as four_star_count,
  SUM(CASE WHEN ar.rating >= 5 AND ar.rating < 7 THEN 1 ELSE 0 END) as three_star_count,
  SUM(CASE WHEN ar.rating >= 3 AND ar.rating < 5 THEN 1 ELSE 0 END) as two_star_count,
  SUM(CASE WHEN ar.rating < 3 THEN 1 ELSE 0 END) as one_star_count
FROM public.analysis_ratings ar
JOIN public.analyses a ON ar.analysis_id = a.id
GROUP BY a.analyzer_id;

-- Grant appropriate access
GRANT SELECT ON public.analyzer_rating_stats TO anon, authenticated;

-- =====================================================
-- 6. SECURE MATERIALIZED VIEWS
-- =====================================================

-- Revoke direct SELECT access to materialized views from anon/authenticated roles
-- Application code should control access through API endpoints with proper authorization

DO $$
BEGIN
  -- Revoke access from trending_analyses if it exists
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' AND matviewname = 'trending_analyses'
  ) THEN
    REVOKE SELECT ON public.trending_analyses FROM anon, authenticated;
    -- Grant to service_role for scheduled refreshes
    GRANT SELECT ON public.trending_analyses TO service_role;
  END IF;
  
  -- Revoke access from user_symbol_affinity if it exists
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' AND matviewname = 'user_symbol_affinity'
  ) THEN
    REVOKE SELECT ON public.user_symbol_affinity FROM anon, authenticated;
    -- Grant to service_role for scheduled refreshes
    GRANT SELECT ON public.user_symbol_affinity TO service_role;
  END IF;
  
  -- Revoke access from user_analyzer_affinity if it exists
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' AND matviewname = 'user_analyzer_affinity'
  ) THEN
    REVOKE SELECT ON public.user_analyzer_affinity FROM anon, authenticated;
    -- Grant to service_role for scheduled refreshes
    GRANT SELECT ON public.user_analyzer_affinity TO service_role;
  END IF;
END $$;

-- =====================================================
-- 7. ADDITIONAL NOTES
-- =====================================================

COMMENT ON INDEX idx_otp_codes_user_id IS 'Foreign key index for optimal query performance';
COMMENT ON FUNCTION public.update_otp_updated_at() IS 'Trigger function with secure search_path to prevent attacks';
COMMENT ON VIEW public.analyzer_rating_stats IS 'Aggregated rating statistics per analyzer (non-SECURITY DEFINER)';
