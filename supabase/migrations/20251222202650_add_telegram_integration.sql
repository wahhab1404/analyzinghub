/*
  # Telegram Integration Schema

  1. New Tables
    - `telegram_accounts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `chat_id` (text, unique) - Telegram chat ID
      - `username` (text, nullable) - Telegram username
      - `linked_at` (timestamptz) - When account was linked
      - `revoked_at` (timestamptz, nullable) - When account was unlinked
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `telegram_link_codes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `code` (text, unique) - 8-character linking code
      - `expires_at` (timestamptz) - Code expires after 10 minutes
      - `used_at` (timestamptz, nullable) - When code was used
      - `created_at` (timestamptz)

    - `notification_delivery_log`
      - `id` (uuid, primary key)
      - `notification_id` (uuid, references notifications)
      - `user_id` (uuid, references profiles)
      - `channel` (text) - 'in_app', 'telegram'
      - `status` (text) - 'pending', 'sent', 'failed'
      - `error_message` (text, nullable)
      - `sent_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Modifications
    - Extend `notification_preferences` with Telegram settings

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

-- Create telegram_accounts table
CREATE TABLE IF NOT EXISTS telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id text NOT NULL UNIQUE,
  username text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user_id ON telegram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_chat_id ON telegram_accounts(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_accounts_active ON telegram_accounts(user_id) WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;

-- Policies for telegram_accounts
CREATE POLICY "Users can view own telegram account"
  ON telegram_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram account"
  ON telegram_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram account"
  ON telegram_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create telegram_link_codes table
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster code lookups
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id ON telegram_link_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_active ON telegram_link_codes(code) WHERE used_at IS NULL;

-- Enable RLS
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Policies for telegram_link_codes
CREATE POLICY "Users can view own link codes"
  ON telegram_link_codes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own link codes"
  ON telegram_link_codes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Service role can read codes for webhook processing
CREATE POLICY "Service role can read all codes"
  ON telegram_link_codes FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update codes"
  ON telegram_link_codes FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create notification_delivery_log table
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('in_app', 'telegram')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'throttled')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification_id ON notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_user_id ON notification_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_status ON notification_delivery_log(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_created_at ON notification_delivery_log(created_at DESC);

-- Enable RLS
ALTER TABLE notification_delivery_log ENABLE ROW LEVEL SECURITY;

-- Policies for notification_delivery_log
CREATE POLICY "Users can view own delivery logs"
  ON notification_delivery_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage delivery logs
CREATE POLICY "Service role can manage delivery logs"
  ON notification_delivery_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Extend notification_preferences with Telegram settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'telegram_enabled'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'telegram_target_hit'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_target_hit boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'telegram_stop_hit'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_stop_hit boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'telegram_new_analysis'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN telegram_new_analysis boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_start'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN quiet_hours_start integer CHECK (quiet_hours_start >= 0 AND quiet_hours_start <= 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'quiet_hours_end'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN quiet_hours_end integer CHECK (quiet_hours_end >= 0 AND quiet_hours_end <= 23);
  END IF;
END $$;

-- Function to check if user has exceeded rate limit
CREATE OR REPLACE FUNCTION check_telegram_rate_limit(p_user_id uuid, p_max_per_minute integer DEFAULT 10)
RETURNS boolean AS $$
DECLARE
  message_count integer;
BEGIN
  SELECT COUNT(*)
  INTO message_count
  FROM notification_delivery_log
  WHERE user_id = p_user_id
    AND channel = 'telegram'
    AND created_at > now() - interval '1 minute';

  RETURN message_count < p_max_per_minute;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if currently in quiet hours
CREATE OR REPLACE FUNCTION is_in_quiet_hours(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_start integer;
  v_end integer;
  v_current_hour integer;
BEGIN
  SELECT quiet_hours_start, quiet_hours_end
  INTO v_start, v_end
  FROM notification_preferences
  WHERE user_id = p_user_id;

  -- If no quiet hours set, return false
  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN false;
  END IF;

  -- Get current hour in user's timezone (assuming UTC for now)
  v_current_hour := EXTRACT(HOUR FROM now());

  -- Check if current hour is in quiet hours range
  IF v_start <= v_end THEN
    RETURN v_current_hour >= v_start AND v_current_hour < v_end;
  ELSE
    -- Handle overnight range (e.g., 22:00 to 06:00)
    RETURN v_current_hour >= v_start OR v_current_hour < v_end;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired link codes
CREATE OR REPLACE FUNCTION cleanup_expired_link_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM telegram_link_codes
  WHERE expires_at < now() - interval '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add updated_at trigger for telegram_accounts
CREATE OR REPLACE FUNCTION update_telegram_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS telegram_accounts_updated_at ON telegram_accounts;
CREATE TRIGGER telegram_accounts_updated_at
  BEFORE UPDATE ON telegram_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_accounts_updated_at();