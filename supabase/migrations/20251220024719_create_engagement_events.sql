/*
  # Create Engagement Events Tracking System

  1. New Tables
    - `engagement_events`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `entity_type` (text) - analysis, analyzer, symbol
      - `entity_id` (uuid) - reference to entity
      - `event_type` (text) - view, like, bookmark, comment, follow, share
      - `metadata` (jsonb) - additional event data
      - `created_at` (timestamptz)

  2. Indexes
    - user_id for personalization queries
    - entity_type + entity_id for entity popularity
    - event_type for filtering
    - created_at for recency
    - composite indexes for efficient querying

  3. Security
    - Enable RLS
    - Users can insert their own events
    - Users can view their own events
    - Service role can read all for recommendations

  4. Notes
    - Designed for high-volume inserts
    - Supports future analytics and ML features
    - Metadata field allows extensibility
*/

-- Create engagement_events table
CREATE TABLE IF NOT EXISTS engagement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('analysis', 'analyzer', 'symbol')),
  entity_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'like', 'bookmark', 'comment', 'follow', 'share', 'unlike', 'unbookmark', 'unfollow')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_engagement_events_user_id ON engagement_events(user_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_entity ON engagement_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_event_type ON engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_events_created_at ON engagement_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_events_user_entity ON engagement_events(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_recent ON engagement_events(entity_type, entity_id, created_at DESC);

-- Enable RLS
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for engagement_events
CREATE POLICY "Users can insert own engagement events"
  ON engagement_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own engagement events"
  ON engagement_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow service role to read all events for recommendations
CREATE POLICY "Service role can read all events"
  ON engagement_events FOR SELECT
  TO service_role
  USING (true);

-- Create materialized view for trending analyses (last 24h)
CREATE MATERIALIZED VIEW IF NOT EXISTS trending_analyses AS
SELECT
  entity_id as analysis_id,
  COUNT(*) as engagement_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE event_type = 'view') as view_count,
  COUNT(*) FILTER (WHERE event_type = 'like') as like_count,
  COUNT(*) FILTER (WHERE event_type = 'bookmark') as bookmark_count,
  COUNT(*) FILTER (WHERE event_type = 'comment') as comment_count,
  COUNT(*) FILTER (WHERE event_type = 'share') as share_count,
  MAX(created_at) as last_engagement
FROM engagement_events
WHERE
  entity_type = 'analysis'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY entity_id;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_trending_analyses_engagement ON trending_analyses(engagement_count DESC);
CREATE INDEX IF NOT EXISTS idx_trending_analyses_last ON trending_analyses(last_engagement DESC);

-- Create function to refresh trending analyses
CREATE OR REPLACE FUNCTION refresh_trending_analyses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY trending_analyses;
END;
$$;

-- Create materialized view for user preferences
CREATE MATERIALIZED VIEW IF NOT EXISTS user_symbol_affinity AS
SELECT
  user_id,
  entity_id as symbol_id,
  COUNT(*) as interaction_count,
  COUNT(*) FILTER (WHERE event_type = 'follow') as follow_count,
  COUNT(*) FILTER (WHERE event_type = 'view') as view_count,
  MAX(created_at) as last_interaction
FROM engagement_events
WHERE
  entity_type = 'symbol'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, entity_id;

CREATE INDEX IF NOT EXISTS idx_user_symbol_affinity_user ON user_symbol_affinity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_symbol_affinity_symbol ON user_symbol_affinity(symbol_id);

-- Create materialized view for analyzer affinity
CREATE MATERIALIZED VIEW IF NOT EXISTS user_analyzer_affinity AS
SELECT
  user_id,
  entity_id as analyzer_id,
  COUNT(*) as interaction_count,
  COUNT(*) FILTER (WHERE event_type = 'follow') as follow_count,
  COUNT(*) FILTER (WHERE event_type = 'view') as view_count,
  MAX(created_at) as last_interaction
FROM engagement_events
WHERE
  entity_type = 'analyzer'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id, entity_id;

CREATE INDEX IF NOT EXISTS idx_user_analyzer_affinity_user ON user_analyzer_affinity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analyzer_affinity_analyzer ON user_analyzer_affinity(analyzer_id);
