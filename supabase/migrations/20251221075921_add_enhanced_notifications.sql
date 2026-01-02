/*
  # Enhanced Notifications System

  ## Overview
  Extends the notifications system to support all social interactions:
  - New follower notifications
  - New analysis from followed analyzers
  - Comments and replies on posts
  - Ratings received by analyzers

  ## Changes
  
  ### notifications table
  - Add `actor_id` column to track who triggered the notification
  - Add `comment_id` column for comment-related notifications
  - Add `parent_comment_id` for reply notifications
  - Add `rating_id` for rating notifications
  - Extend type enum to include new notification types
  
  ### New notification types:
  - `new_follower` - Someone followed you
  - `new_analysis` - Analyzer you follow posted new analysis
  - `comment` - Someone commented on your post
  - `reply` - Someone replied to your comment
  - `new_rating` - Someone rated you as an analyzer
  - `like` - Someone liked your post
  - `repost` - Someone reposted your post
  - `target_hit` - Your analysis target was hit
  - `stop_hit` - Your analysis stop loss was hit

  ## Security
  - Maintains existing RLS policies
  - All new columns are optional
*/

-- Drop existing type constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new columns for enhanced notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS rating_id uuid;

-- Add new type constraint with all notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'target_hit', 
    'stop_hit', 
    'comment', 
    'reply',
    'like', 
    'follow',
    'new_follower', 
    'repost',
    'new_analysis',
    'new_rating'
  ));

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON notifications(actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment_id ON notifications(comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Function to create notification for new follower
CREATE OR REPLACE FUNCTION notify_new_follower()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (
    user_id,
    actor_id,
    type,
    title,
    message
  ) VALUES (
    NEW.following_id,
    NEW.follower_id,
    'new_follower',
    'New Follower',
    (SELECT full_name FROM profiles WHERE id = NEW.follower_id) || ' started following you'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new analysis from followed analyzer
CREATE OR REPLACE FUNCTION notify_new_analysis()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify all followers of this analyzer
  INSERT INTO notifications (
    user_id,
    actor_id,
    analysis_id,
    type,
    title,
    message
  )
  SELECT 
    f.follower_id,
    NEW.analyzer_id,
    NEW.id,
    'new_analysis',
    'New Analysis',
    (SELECT full_name FROM profiles WHERE id = NEW.analyzer_id) || ' posted a new ' || NEW.direction || ' analysis on ' || (SELECT symbol FROM symbols WHERE id = NEW.symbol_id)
  FROM follows f
  WHERE f.following_id = NEW.analyzer_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new comment
CREATE OR REPLACE FUNCTION notify_new_comment()
RETURNS TRIGGER AS $$
DECLARE
  analysis_owner_id uuid;
BEGIN
  -- Get the owner of the analysis
  SELECT analyzer_id INTO analysis_owner_id
  FROM analyses
  WHERE id = NEW.analysis_id;
  
  -- Notify analysis owner if comment is not from them
  IF analysis_owner_id != NEW.user_id THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      analysis_id,
      comment_id,
      type,
      title,
      message
    ) VALUES (
      analysis_owner_id,
      NEW.user_id,
      NEW.analysis_id,
      NEW.id,
      'comment',
      'New Comment',
      (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' commented on your analysis'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for reply to comment
CREATE OR REPLACE FUNCTION notify_comment_reply()
RETURNS TRIGGER AS $$
DECLARE
  parent_comment_owner_id uuid;
BEGIN
  -- Only process if this is a reply (has parent_comment_id)
  IF NEW.parent_comment_id IS NOT NULL THEN
    -- Get the owner of the parent comment
    SELECT user_id INTO parent_comment_owner_id
    FROM comments
    WHERE id = NEW.parent_comment_id;
    
    -- Notify parent comment owner if reply is not from them
    IF parent_comment_owner_id != NEW.user_id THEN
      INSERT INTO notifications (
        user_id,
        actor_id,
        analysis_id,
        comment_id,
        parent_comment_id,
        type,
        title,
        message
      ) VALUES (
        parent_comment_owner_id,
        NEW.user_id,
        NEW.analysis_id,
        NEW.id,
        NEW.parent_comment_id,
        'reply',
        'New Reply',
        (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' replied to your comment'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new like
CREATE OR REPLACE FUNCTION notify_new_like()
RETURNS TRIGGER AS $$
DECLARE
  analysis_owner_id uuid;
BEGIN
  -- Get the owner of the analysis
  SELECT analyzer_id INTO analysis_owner_id
  FROM analyses
  WHERE id = NEW.analysis_id;
  
  -- Notify analysis owner if like is not from them
  IF analysis_owner_id != NEW.user_id THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      analysis_id,
      type,
      title,
      message
    ) VALUES (
      analysis_owner_id,
      NEW.user_id,
      NEW.analysis_id,
      'like',
      'New Like',
      (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' liked your analysis'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new repost
CREATE OR REPLACE FUNCTION notify_new_repost()
RETURNS TRIGGER AS $$
DECLARE
  analysis_owner_id uuid;
BEGIN
  -- Get the owner of the analysis
  SELECT analyzer_id INTO analysis_owner_id
  FROM analyses
  WHERE id = NEW.analysis_id;
  
  -- Notify analysis owner if repost is not from them
  IF analysis_owner_id != NEW.user_id THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      analysis_id,
      type,
      title,
      message
    ) VALUES (
      analysis_owner_id,
      NEW.user_id,
      NEW.analysis_id,
      'repost',
      'New Repost',
      (SELECT full_name FROM profiles WHERE id = NEW.user_id) || ' reposted your analysis'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for new rating
CREATE OR REPLACE FUNCTION notify_new_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify the analyzer they received a rating (not for analysis ratings, but for analyzer_ratings table if it exists)
  -- Since we have analyzer_ratings table, let's use that
  IF TG_TABLE_NAME = 'analyzer_ratings' THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      rating_id,
      type,
      title,
      message
    ) VALUES (
      NEW.analyzer_id,
      NEW.rater_id,
      NEW.id,
      'new_rating',
      'New Rating',
      (SELECT full_name FROM profiles WHERE id = NEW.rater_id) || ' rated you ' || NEW.rating || '/10'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for automatic notifications
DROP TRIGGER IF EXISTS trigger_notify_new_follower ON follows;
CREATE TRIGGER trigger_notify_new_follower
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_follower();

DROP TRIGGER IF EXISTS trigger_notify_new_analysis ON analyses;
CREATE TRIGGER trigger_notify_new_analysis
  AFTER INSERT ON analyses
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_analysis();

DROP TRIGGER IF EXISTS trigger_notify_new_comment ON comments;
CREATE TRIGGER trigger_notify_new_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_comment();

DROP TRIGGER IF EXISTS trigger_notify_comment_reply ON comments;
CREATE TRIGGER trigger_notify_comment_reply
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_comment_reply();

DROP TRIGGER IF EXISTS trigger_notify_new_like ON likes;
CREATE TRIGGER trigger_notify_new_like
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_like();

DROP TRIGGER IF EXISTS trigger_notify_new_repost ON reposts;
CREATE TRIGGER trigger_notify_new_repost
  AFTER INSERT ON reposts
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_repost();

-- Grant necessary permissions for triggers to work
GRANT INSERT ON notifications TO authenticated;
