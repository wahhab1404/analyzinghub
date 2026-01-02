/*
  # Allow authenticated users to read telegram_bot_token

  1. Changes
    - Add policy for authenticated users to read telegram_bot_token setting
    - This is needed for channel connection to work for all analyzers

  2. Security
    - Only the telegram_bot_token setting is readable by authenticated users
    - All other settings remain SuperAdmin-only
*/

-- Allow authenticated users to read the telegram_bot_token setting
CREATE POLICY "Authenticated users can read bot token"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (setting_key = 'telegram_bot_token');
