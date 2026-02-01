/*
  # Link Advertisement Channels to Users

  1. Changes
    - Add user_id column to telegram_ad_channels
    - Update RLS policies to allow users to manage their own channels
    - Update constraints

  2. Security
    - Users can only manage their own ad channels
    - Service role maintains full access
*/

-- Add user_id column
ALTER TABLE telegram_ad_channels 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Make user_id required for new records
ALTER TABLE telegram_ad_channels 
ALTER COLUMN user_id SET NOT NULL;

-- Update unique constraint to be per user
ALTER TABLE telegram_ad_channels 
DROP CONSTRAINT IF EXISTS telegram_ad_channels_channel_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_ad_channels_user_channel_unique 
ON telegram_ad_channels(user_id, channel_id);

-- Drop old admin policies
DROP POLICY IF EXISTS "Admins can view ad channels" ON telegram_ad_channels;
DROP POLICY IF EXISTS "Admins can insert ad channels" ON telegram_ad_channels;
DROP POLICY IF EXISTS "Admins can update ad channels" ON telegram_ad_channels;
DROP POLICY IF EXISTS "Admins can delete ad channels" ON telegram_ad_channels;

-- New policies: Users manage their own channels
CREATE POLICY "Users can view own ad channels"
  ON telegram_ad_channels
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own ad channels"
  ON telegram_ad_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ad channels"
  ON telegram_ad_channels
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own ad channels"
  ON telegram_ad_channels
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role full access remains
CREATE POLICY "Service role full access to ad channels v2"
  ON telegram_ad_channels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
