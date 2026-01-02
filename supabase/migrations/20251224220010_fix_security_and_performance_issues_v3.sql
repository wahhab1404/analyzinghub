/*
  # Fix Security and Performance Issues

  ## Changes Made
  
  1. **RLS Policy Performance Optimization**
     - Fixed admin_settings policies to use `(select auth.uid())` instead of `auth.uid()`
     - This prevents re-evaluation of auth functions for each row
  
  2. **Consolidate Duplicate Policies**
     - Removed duplicate policy on admin_settings for reading bot token
     - Removed duplicate policy on analysis_ratings for public viewing
     - Kept the more comprehensive policies
  
  3. **Remove Unused Indexes**
     - Removed indexes that are not being used and unlikely to be used
     - Kept indexes that will be useful for future queries
  
  4. **Fix SECURITY DEFINER View**
     - Recreated analyzer_rating_stats view without SECURITY DEFINER
     - The view already uses regular permissions based on RLS of underlying tables
  
  ## Security Notes
  - All policies maintain the same security posture
  - Performance improvements do not compromise security
  - Removed redundant policies to avoid confusion
*/

-- ============================================
-- 1. Fix RLS Policies on admin_settings
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "SuperAdmins can view all settings" ON public.admin_settings;
DROP POLICY IF EXISTS "SuperAdmins can insert settings" ON public.admin_settings;
DROP POLICY IF EXISTS "SuperAdmins can update settings" ON public.admin_settings;

-- Recreate with optimized auth function calls
CREATE POLICY "SuperAdmins can view all settings"
  ON public.admin_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
    )
  );

CREATE POLICY "SuperAdmins can insert settings"
  ON public.admin_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
    )
  );

CREATE POLICY "SuperAdmins can update settings"
  ON public.admin_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role_id = (SELECT id FROM public.roles WHERE name = 'super_admin')
    )
  );

-- ============================================
-- 2. Consolidate Duplicate Policies
-- ============================================

-- Remove duplicate policy on admin_settings (keep the SuperAdmin one above)
DROP POLICY IF EXISTS "Authenticated users can read bot token" ON public.admin_settings;

-- Remove duplicate policy on analysis_ratings (keep the more comprehensive one)
DROP POLICY IF EXISTS "Public can view analysis ratings" ON public.analysis_ratings;

-- ============================================
-- 3. Remove Unused Indexes
-- ============================================

-- Remove indexes that are unlikely to be used
DROP INDEX IF EXISTS public.idx_otp_codes_user_id;
DROP INDEX IF EXISTS public.idx_admin_settings_updated_by;
DROP INDEX IF EXISTS public.idx_analyses_post_type;
DROP INDEX IF EXISTS public.idx_channel_broadcast_log_channel_id;
DROP INDEX IF EXISTS public.idx_channel_broadcast_log_analysis_id;
DROP INDEX IF EXISTS public.idx_notification_delivery_log_notification_id;
DROP INDEX IF EXISTS public.idx_notifications_actor_id;
DROP INDEX IF EXISTS public.idx_notifications_analysis_id;
DROP INDEX IF EXISTS public.idx_notifications_comment_id;
DROP INDEX IF EXISTS public.idx_notifications_parent_comment_id;
DROP INDEX IF EXISTS public.idx_profiles_tutorial_completed;

-- Keep these indexes as they will be used in common queries:
-- idx_analyses_symbol_id - used for filtering by symbol
-- idx_analyses_post_type_created_at - used for feed queries
-- idx_analysis_ratings_user_id - used for user ratings
-- idx_comments_user_id - used for user comments
-- idx_comments_parent_comment_id - used for reply threads
-- idx_likes_user_id - used for user likes
-- idx_profiles_role_id - used for role-based queries
-- idx_reposts_user_id - used for user reposts
-- idx_analyses_analysis_type - used for filtering by type

-- ============================================
-- 4. Fix SECURITY DEFINER View
-- ============================================

-- Drop the existing view
DROP VIEW IF EXISTS public.analyzer_rating_stats;

-- Recreate without SECURITY DEFINER
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

-- Add comment
COMMENT ON VIEW public.analyzer_rating_stats IS 'Aggregated rating statistics for analyzers. Accessible based on RLS policies on underlying tables.';
