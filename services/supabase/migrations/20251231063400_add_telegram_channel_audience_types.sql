/*
  # Add Telegram Channel Audience Types
  
  1. Changes to telegram_channels
    - Add `audience_type` column to support different channel types:
      - 'public': General channel for all followers
      - 'followers': Exclusive channel for followers-only content  
      - 'subscribers': Premium channel for subscribers-only content
    - Remove unique constraint on channel_id to allow same channel for multiple audience types
    - Add unique constraint on (user_id, channel_id, audience_type) combination
    
  2. Updates
    - Allow analyzers to configure up to 3 channels (one per audience type)
    - Update broadcast logic to send to appropriate channel based on content visibility
    
  3. Notes
    - Existing channels will be marked as 'public' by default
    - Analyzers can use the same Telegram channel for multiple audience types or different channels
*/

-- Add audience_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_channels' AND column_name = 'audience_type'
  ) THEN
    ALTER TABLE telegram_channels ADD COLUMN audience_type text NOT NULL DEFAULT 'public' 
      CHECK (audience_type IN ('public', 'followers', 'subscribers'));
  END IF;
END $$;

-- Drop old unique constraint on channel_id if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telegram_channels_channel_id_key'
  ) THEN
    ALTER TABLE telegram_channels DROP CONSTRAINT telegram_channels_channel_id_key;
  END IF;
END $$;

-- Drop old unique constraint on user_channel if it exists  
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_channel'
  ) THEN
    ALTER TABLE telegram_channels DROP CONSTRAINT unique_user_channel;
  END IF;
END $$;

-- Add new unique constraint on (user_id, audience_type)
-- One channel per audience type per user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_audience_type'
  ) THEN
    ALTER TABLE telegram_channels ADD CONSTRAINT unique_user_audience_type 
      UNIQUE(user_id, audience_type);
  END IF;
END $$;

-- Update indexes
DROP INDEX IF EXISTS idx_telegram_channels_channel_id;
CREATE INDEX IF NOT EXISTS idx_telegram_channels_channel_audience 
  ON telegram_channels(channel_id, audience_type) WHERE enabled = true;

-- Update function to get analyzer channels (now returns all active channels)
CREATE OR REPLACE FUNCTION get_analyzer_channels(p_user_id uuid)
RETURNS TABLE(
  channel_id text,
  channel_name text,
  audience_type text,
  notify_new_analysis boolean,
  notify_target_hit boolean,
  notify_stop_hit boolean,
  broadcast_language text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.channel_id,
    tc.channel_name,
    tc.audience_type,
    tc.notify_new_analysis,
    tc.notify_target_hit,
    tc.notify_stop_hit,
    tc.broadcast_language
  FROM telegram_channels tc
  WHERE tc.user_id = p_user_id
    AND tc.enabled = true
    AND tc.verified_at IS NOT NULL
  ORDER BY 
    CASE tc.audience_type
      WHEN 'public' THEN 1
      WHEN 'followers' THEN 2
      WHEN 'subscribers' THEN 3
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add broadcast_language column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'telegram_channels' AND column_name = 'broadcast_language'
  ) THEN
    ALTER TABLE telegram_channels ADD COLUMN broadcast_language text NOT NULL DEFAULT 'both'
      CHECK (broadcast_language IN ('en', 'ar', 'both'));
  END IF;
END $$;