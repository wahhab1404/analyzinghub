/*
  # Backfill Notifications for Existing Data

  ## Overview
  Creates notifications for existing follows, comments, and other social interactions
  that occurred before the notification triggers were set up.

  ## Changes
  - Creates new_follower notifications for existing follows
  - Creates comment notifications for existing comments
  - Creates reply notifications for existing comment replies
  - Creates like notifications for existing likes
  - Creates repost notifications for existing reposts
  - Creates new_analysis notifications for followers

  ## Safety
  - Uses INSERT ... ON CONFLICT DO NOTHING to avoid duplicates
  - Only creates notifications where actor != recipient
*/

-- Backfill new_follower notifications
INSERT INTO notifications (
  user_id,
  actor_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  f.following_id,
  f.follower_id,
  'new_follower',
  'New Follower',
  p.full_name || ' started following you',
  f.created_at
FROM follows f
JOIN profiles p ON p.id = f.follower_id
ON CONFLICT DO NOTHING;

-- Backfill comment notifications
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  comment_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  a.analyzer_id,
  c.user_id,
  c.analysis_id,
  c.id,
  'comment',
  'New Comment',
  p.full_name || ' commented on your analysis',
  c.created_at
FROM comments c
JOIN analyses a ON a.id = c.analysis_id
JOIN profiles p ON p.id = c.user_id
WHERE c.parent_comment_id IS NULL
  AND a.analyzer_id != c.user_id
ON CONFLICT DO NOTHING;

-- Backfill reply notifications
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  comment_id,
  parent_comment_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  parent_c.user_id,
  c.user_id,
  c.analysis_id,
  c.id,
  c.parent_comment_id,
  'reply',
  'New Reply',
  p.full_name || ' replied to your comment',
  c.created_at
FROM comments c
JOIN comments parent_c ON parent_c.id = c.parent_comment_id
JOIN profiles p ON p.id = c.user_id
WHERE c.parent_comment_id IS NOT NULL
  AND parent_c.user_id != c.user_id
ON CONFLICT DO NOTHING;

-- Backfill like notifications
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  a.analyzer_id,
  l.user_id,
  l.analysis_id,
  'like',
  'New Like',
  p.full_name || ' liked your analysis',
  l.created_at
FROM likes l
JOIN analyses a ON a.id = l.analysis_id
JOIN profiles p ON p.id = l.user_id
WHERE a.analyzer_id != l.user_id
ON CONFLICT DO NOTHING;

-- Backfill repost notifications
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  a.analyzer_id,
  r.user_id,
  r.analysis_id,
  'repost',
  'New Repost',
  p.full_name || ' reposted your analysis',
  r.created_at
FROM reposts r
JOIN analyses a ON a.id = r.analysis_id
JOIN profiles p ON p.id = r.user_id
WHERE a.analyzer_id != r.user_id
ON CONFLICT DO NOTHING;

-- Backfill new_analysis notifications for followers
INSERT INTO notifications (
  user_id,
  actor_id,
  analysis_id,
  type,
  title,
  message,
  created_at
)
SELECT 
  f.follower_id,
  a.analyzer_id,
  a.id,
  'new_analysis',
  'New Analysis',
  p.full_name || ' posted a new ' || a.direction || ' analysis on ' || s.symbol,
  a.created_at
FROM analyses a
JOIN follows f ON f.following_id = a.analyzer_id
JOIN profiles p ON p.id = a.analyzer_id
JOIN symbols s ON s.id = a.symbol_id
ON CONFLICT DO NOTHING;

-- Backfill ratings notifications if ratings table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ratings') THEN
    INSERT INTO notifications (
      user_id,
      actor_id,
      rating_id,
      type,
      title,
      message,
      created_at
    )
    SELECT 
      r.analyzer_id,
      r.rater_id,
      r.id,
      'new_rating',
      'New Rating',
      p.full_name || ' rated you ' || r.rating || '/10',
      r.created_at
    FROM ratings r
    JOIN profiles p ON p.id = r.rater_id
    WHERE r.analyzer_id != r.rater_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
