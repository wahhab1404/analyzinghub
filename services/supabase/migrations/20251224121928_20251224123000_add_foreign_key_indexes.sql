/*
  # Add Foreign Key Indexes for Performance

  ## Overview
  Adds indexes for all foreign key columns to improve query performance and prevent
  suboptimal JOIN operations. Foreign key indexes are critical for:
  - JOIN query performance
  - CASCADE operations (DELETE/UPDATE)
  - Referential integrity checks
  - Parent-child relationship queries

  ## Indexes Added

  ### admin_settings
  - updated_by: Index for tracking who modified settings

  ### analyses
  - symbol_id: Index for symbol-based analysis queries

  ### analysis_ratings
  - analysis_id: Already has unique constraint (covered)
  - user_id: Index for user's rating history

  ### channel_broadcast_log
  - channel_id: Index for channel broadcast history
  - user_id: Index for user's broadcast logs
  - analysis_id: Index for analysis broadcast tracking

  ### comments
  - analysis_id: Already indexed (covered)
  - user_id: Index for user's comment history
  - parent_comment_id: Index for nested comment threads

  ### likes
  - analysis_id: Already has unique constraint (covered)
  - user_id: Index for user's liked analyses

  ### notification_delivery_log
  - notification_id: Index for notification delivery tracking
  - user_id: Index for user's delivery history

  ### notifications
  - user_id: Already indexed (covered)
  - actor_id: Index for tracking who triggered notifications
  - analysis_id: Index for analysis-related notifications
  - comment_id: Index for comment notifications
  - parent_comment_id: Index for reply notifications

  ### profiles
  - role_id: Index for role-based queries

  ### reposts
  - analysis_id: Already has unique constraint (covered)
  - user_id: Index for user's repost history

  ### saves
  - analysis_id: Already has unique constraint (covered)
  - user_id: Index for user's saved analyses

  ## Notes
  - Only creates indexes that don't already exist
  - Uses IF NOT EXISTS to prevent errors on re-run
  - Focuses on foreign keys without existing coverage via unique constraints
*/

-- =====================================================
-- ADMIN_SETTINGS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_admin_settings_updated_by
  ON public.admin_settings(updated_by);

-- =====================================================
-- ANALYSES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_analyses_symbol_id
  ON public.analyses(symbol_id);

-- =====================================================
-- ANALYSIS_RATINGS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_analysis_ratings_user_id
  ON public.analysis_ratings(user_id);

-- =====================================================
-- CHANNEL_BROADCAST_LOG
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_channel_id
  ON public.channel_broadcast_log(channel_id);

CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_user_id
  ON public.channel_broadcast_log(user_id);

CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_analysis_id
  ON public.channel_broadcast_log(analysis_id);

-- =====================================================
-- COMMENTS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_comments_user_id
  ON public.comments(user_id);

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id
  ON public.comments(parent_comment_id);

-- =====================================================
-- LIKES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_likes_user_id
  ON public.likes(user_id);

-- =====================================================
-- NOTIFICATION_DELIVERY_LOG
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification_id
  ON public.notification_delivery_log(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_user_id
  ON public.notification_delivery_log(user_id);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications(actor_id);

CREATE INDEX IF NOT EXISTS idx_notifications_analysis_id
  ON public.notifications(analysis_id);

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications(comment_id);

CREATE INDEX IF NOT EXISTS idx_notifications_parent_comment_id
  ON public.notifications(parent_comment_id);

-- =====================================================
-- PROFILES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role_id
  ON public.profiles(role_id);

-- =====================================================
-- REPOSTS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_reposts_user_id
  ON public.reposts(user_id);

-- =====================================================
-- SAVES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_saves_user_id
  ON public.saves(user_id);

-- =====================================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON INDEX idx_admin_settings_updated_by IS 'Foreign key index for admin_settings.updated_by';
COMMENT ON INDEX idx_analyses_symbol_id IS 'Foreign key index for analyses.symbol_id';
COMMENT ON INDEX idx_analysis_ratings_user_id IS 'Foreign key index for analysis_ratings.user_id';
COMMENT ON INDEX idx_channel_broadcast_log_channel_id IS 'Index for channel broadcast history queries';
COMMENT ON INDEX idx_channel_broadcast_log_user_id IS 'Foreign key index for channel_broadcast_log.user_id';
COMMENT ON INDEX idx_channel_broadcast_log_analysis_id IS 'Foreign key index for channel_broadcast_log.analysis_id';
COMMENT ON INDEX idx_comments_user_id IS 'Foreign key index for comments.user_id';
COMMENT ON INDEX idx_comments_parent_comment_id IS 'Foreign key index for comments.parent_comment_id (nested threads)';
COMMENT ON INDEX idx_likes_user_id IS 'Foreign key index for likes.user_id';
COMMENT ON INDEX idx_notification_delivery_log_notification_id IS 'Foreign key index for notification_delivery_log.notification_id';
COMMENT ON INDEX idx_notification_delivery_log_user_id IS 'Foreign key index for notification_delivery_log.user_id';
COMMENT ON INDEX idx_notifications_actor_id IS 'Foreign key index for notifications.actor_id';
COMMENT ON INDEX idx_notifications_analysis_id IS 'Foreign key index for notifications.analysis_id';
COMMENT ON INDEX idx_notifications_comment_id IS 'Foreign key index for notifications.comment_id';
COMMENT ON INDEX idx_notifications_parent_comment_id IS 'Foreign key index for notifications.parent_comment_id';
COMMENT ON INDEX idx_profiles_role_id IS 'Foreign key index for profiles.role_id';
COMMENT ON INDEX idx_reposts_user_id IS 'Foreign key index for reposts.user_id';
COMMENT ON INDEX idx_saves_user_id IS 'Foreign key index for saves.user_id';
