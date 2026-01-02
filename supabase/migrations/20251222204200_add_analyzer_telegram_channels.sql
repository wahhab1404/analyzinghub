/*
  # Analyzer Telegram Channels

  1. New Tables
    - `telegram_channels`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles) - The analyzer who owns the channel
      - `channel_id` (text, unique) - Telegram channel ID (starts with -100)
      - `channel_name` (text) - Channel username or title
      - `enabled` (boolean) - Whether broadcasting is enabled
      - `notify_new_analysis` (boolean) - Send when new analysis is published
      - `notify_target_hit` (boolean) - Send when target is hit
      - `notify_stop_hit` (boolean) - Send when stop loss is hit
      - `verified_at` (timestamptz) - When bot access was verified
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on telegram_channels
    - Analyzers can manage their own channels
    - Traders cannot access channel settings

  3. Notes
    - Channels are different from personal chats
    - Bot must be added as admin to the channel
    - Channel IDs typically start with -100
*/

-- Create telegram_channels table
CREATE TABLE IF NOT EXISTS telegram_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id text NOT NULL UNIQUE,
  channel_name text NOT NULL,
  enabled boolean DEFAULT true,
  notify_new_analysis boolean DEFAULT true,
  notify_target_hit boolean DEFAULT true,
  notify_stop_hit boolean DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_channel UNIQUE(user_id, channel_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_telegram_channels_user_id ON telegram_channels(user_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_telegram_channels_channel_id ON telegram_channels(channel_id) WHERE enabled = true;

-- Enable RLS
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;

-- Policies for telegram_channels
CREATE POLICY "Analyzers can view own channels"
  ON telegram_channels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Analyzers can insert own channels"
  ON telegram_channels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Analyzers can update own channels"
  ON telegram_channels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Analyzers can delete own channels"
  ON telegram_channels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all channels
CREATE POLICY "Service role can manage channels"
  ON telegram_channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_telegram_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telegram_channels_updated_at ON telegram_channels;
CREATE TRIGGER telegram_channels_updated_at
  BEFORE UPDATE ON telegram_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_channels_updated_at();

-- Function to get analyzer's active channel
CREATE OR REPLACE FUNCTION get_analyzer_channel(p_user_id uuid)
RETURNS TABLE(
  channel_id text,
  channel_name text,
  notify_new_analysis boolean,
  notify_target_hit boolean,
  notify_stop_hit boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.channel_id,
    tc.channel_name,
    tc.notify_new_analysis,
    tc.notify_target_hit,
    tc.notify_stop_hit
  FROM telegram_channels tc
  WHERE tc.user_id = p_user_id
    AND tc.enabled = true
    AND tc.verified_at IS NOT NULL
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add channel broadcast log
CREATE TABLE IF NOT EXISTS channel_broadcast_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('new_analysis', 'target_hit', 'stop_hit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message text,
  message_id text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for broadcast log
CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_channel_id ON channel_broadcast_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_user_id ON channel_broadcast_log(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_analysis_id ON channel_broadcast_log(analysis_id);
CREATE INDEX IF NOT EXISTS idx_channel_broadcast_log_created_at ON channel_broadcast_log(created_at DESC);

-- Enable RLS
ALTER TABLE channel_broadcast_log ENABLE ROW LEVEL SECURITY;

-- Policies for broadcast log
CREATE POLICY "Analyzers can view own broadcast logs"
  ON channel_broadcast_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage broadcast logs
CREATE POLICY "Service role can manage broadcast logs"
  ON channel_broadcast_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);