/*
  # Fix Security and Performance Issues

  1. Performance Improvements
    - Add missing indexes on foreign key columns
    - These indexes improve query performance for joins and lookups

  2. Indexes Added
    - admin_settings.updated_by
    - analyses.symbol_id
    - likes.user_id
    - notifications.analysis_id
    - notifications.parent_comment_id

  3. Notes
    - RLS policy optimizations will be handled in a separate migration
    - Function search paths will be fixed in a separate migration
*/

-- Add index for admin_settings.updated_by
CREATE INDEX IF NOT EXISTS idx_admin_settings_updated_by 
  ON admin_settings(updated_by);

-- Add index for analyses.symbol_id
CREATE INDEX IF NOT EXISTS idx_analyses_symbol_id 
  ON analyses(symbol_id);

-- Add index for likes.user_id
CREATE INDEX IF NOT EXISTS idx_likes_user_id 
  ON likes(user_id);

-- Add index for notifications.analysis_id
CREATE INDEX IF NOT EXISTS idx_notifications_analysis_id 
  ON notifications(analysis_id);

-- Add index for notifications.parent_comment_id
CREATE INDEX IF NOT EXISTS idx_notifications_parent_comment_id 
  ON notifications(parent_comment_id);
