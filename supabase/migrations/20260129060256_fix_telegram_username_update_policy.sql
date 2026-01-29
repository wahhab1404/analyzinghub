/*
  # Fix Telegram Username Update Policy

  1. Changes
    - Add service role policy to allow updating telegram_username in profiles
    - This is needed for the subscription API which uses service role credentials
    - Service role can update any user's telegram_username during subscription

  2. Security
    - Only service role can use this policy
    - Regular users still use existing authenticated policy
*/

-- Add service role policy for updating telegram_username
CREATE POLICY "Service role can update telegram username"
  ON profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
