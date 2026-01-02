/*
  # Fix Function Search Paths (v2)

  1. Changes
    - Set explicit search_path on all functions to prevent search_path hijacking
    - This makes functions immutable to search_path changes
    - Improves security and performance

  2. Functions Updated
    - All trigger functions
    - All notification functions
    - All utility functions
    - All RPC functions
*/

-- Set search_path for trigger functions
ALTER FUNCTION update_updated_at_column() 
  SET search_path = public;

ALTER FUNCTION create_default_notification_preferences() 
  SET search_path = public;

ALTER FUNCTION update_analysis_status_on_validation() 
  SET search_path = public;

ALTER FUNCTION update_analyzer_ratings_updated_at() 
  SET search_path = public;

ALTER FUNCTION update_analysis_ratings_updated_at() 
  SET search_path = public;

ALTER FUNCTION update_telegram_accounts_updated_at() 
  SET search_path = public;

ALTER FUNCTION update_telegram_channels_updated_at() 
  SET search_path = public;

ALTER FUNCTION update_admin_settings_updated_at() 
  SET search_path = public;

ALTER FUNCTION update_analyzer_rating_stats() 
  SET search_path = public;

-- Set search_path for notification functions
ALTER FUNCTION notify_new_follower() 
  SET search_path = public;

ALTER FUNCTION notify_new_analysis() 
  SET search_path = public;

ALTER FUNCTION notify_new_comment() 
  SET search_path = public;

ALTER FUNCTION notify_comment_reply() 
  SET search_path = public;

ALTER FUNCTION notify_new_like() 
  SET search_path = public;

ALTER FUNCTION notify_new_repost() 
  SET search_path = public;

ALTER FUNCTION notify_new_rating() 
  SET search_path = public;

ALTER FUNCTION notify_analysis_rating() 
  SET search_path = public;

-- Set search_path for utility functions
ALTER FUNCTION create_admin_profile(uuid, text) 
  SET search_path = public;

ALTER FUNCTION refresh_trending_analyses() 
  SET search_path = public;

ALTER FUNCTION cleanup_expired_link_codes() 
  SET search_path = public;

-- Set search_path for RPC functions
ALTER FUNCTION check_telegram_rate_limit(p_user_id uuid, p_max_per_minute integer) 
  SET search_path = public;

ALTER FUNCTION is_in_quiet_hours(p_user_id uuid) 
  SET search_path = public;

ALTER FUNCTION get_analyzer_channel(p_user_id uuid) 
  SET search_path = public;

ALTER FUNCTION get_analyzer_stats(p_user_id uuid) 
  SET search_path = public;
