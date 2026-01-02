/*
  # Fix Database Performance and Security Issues

  ## Changes Made
  
  ### 1. Add Missing Foreign Key Indexes
  These indexes improve query performance for foreign key lookups:
  - `admin_settings.updated_by` - Index for admin settings update tracking
  - `channel_broadcast_log.analysis_id` - Index for broadcast log queries
  - `notification_delivery_log.notification_id` - Index for notification delivery tracking
  - `notifications.actor_id` - Index for finding notifications by actor
  - `notifications.analysis_id` - Index for analysis-related notifications
  - `notifications.comment_id` - Index for comment notifications
  - `notifications.parent_comment_id` - Index for reply notifications
  - `otp_codes.user_id` - Index for OTP code lookups by user
  
  ### 2. Remove Unused Indexes
  These indexes were never used and consume storage/maintenance overhead:
  - Removed 9 unused indexes from various tables
  
  ### 3. Fix Security Definer View
  - Recreated `analyzer_rating_stats` view without SECURITY DEFINER
  - This removes unnecessary privilege escalation
  
  ## Performance Impact
  - Improved query performance on foreign key lookups
  - Reduced storage overhead from unused indexes
  - Faster write operations (fewer indexes to maintain)
*/

-- Add missing foreign key indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_settings_updated_by 
  ON admin_settings(updated_by);

CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_analysis_id 
  ON channel_broadcast_log(analysis_id);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification_id 
  ON notification_delivery_log(notification_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id 
  ON notifications(actor_id);

CREATE INDEX IF NOT EXISTS idx_notifications_analysis_id 
  ON notifications(analysis_id);

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id 
  ON notifications(comment_id);

CREATE INDEX IF NOT EXISTS idx_notifications_parent_comment_id 
  ON notifications(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_otp_codes_user_id 
  ON otp_codes(user_id);

-- Remove unused indexes that were never utilized
DROP INDEX IF EXISTS idx_comments_user_id;
DROP INDEX IF EXISTS idx_comments_parent_comment_id;
DROP INDEX IF EXISTS idx_likes_user_id;
DROP INDEX IF EXISTS idx_reposts_user_id;
DROP INDEX IF EXISTS idx_analysis_ratings_user_id;
DROP INDEX IF EXISTS idx_analyses_symbol_id;
DROP INDEX IF EXISTS idx_analyses_post_type_created_at;
DROP INDEX IF EXISTS idx_analyses_analysis_type;
DROP INDEX IF EXISTS idx_profiles_role_id;

-- Fix SECURITY DEFINER view issue
-- Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS analyzer_rating_stats;

CREATE OR REPLACE VIEW analyzer_rating_stats AS
SELECT 
  a.analyzer_id,
  COUNT(*) AS rating_count,
  AVG(ar.rating) AS average_rating,
  SUM(CASE WHEN ar.rating >= 9 THEN 1 ELSE 0 END) AS five_star_count,
  SUM(CASE WHEN ar.rating >= 7 AND ar.rating < 9 THEN 1 ELSE 0 END) AS four_star_count,
  SUM(CASE WHEN ar.rating >= 5 AND ar.rating < 7 THEN 1 ELSE 0 END) AS three_star_count,
  SUM(CASE WHEN ar.rating >= 3 AND ar.rating < 5 THEN 1 ELSE 0 END) AS two_star_count,
  SUM(CASE WHEN ar.rating < 3 THEN 1 ELSE 0 END) AS one_star_count
FROM analysis_ratings ar
JOIN analyses a ON ar.analysis_id = a.id
GROUP BY a.analyzer_id;
