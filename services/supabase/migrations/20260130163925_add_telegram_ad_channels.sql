/*
  # Add Telegram Advertisement Channels

  1. New Tables
    - `telegram_ad_channels`
      - `id` (uuid, primary key)
      - `channel_id` (text) - Telegram channel ID
      - `channel_name` (text) - Display name
      - `is_active` (boolean) - Whether channel is active
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS
    - Only admins can manage ad channels
*/

CREATE TABLE IF NOT EXISTS telegram_ad_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL UNIQUE,
  channel_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE telegram_ad_channels ENABLE ROW LEVEL SECURITY;

-- Only admins can view ad channels
CREATE POLICY "Admins can view ad channels"
  ON telegram_ad_channels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Only admins can insert ad channels
CREATE POLICY "Admins can insert ad channels"
  ON telegram_ad_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Only admins can update ad channels
CREATE POLICY "Admins can update ad channels"
  ON telegram_ad_channels
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Only admins can delete ad channels
CREATE POLICY "Admins can delete ad channels"
  ON telegram_ad_channels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Service role can access everything
CREATE POLICY "Service role full access to ad channels"
  ON telegram_ad_channels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_telegram_ad_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_telegram_ad_channels_updated_at
  BEFORE UPDATE ON telegram_ad_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_telegram_ad_channels_updated_at();
