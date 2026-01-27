/*
  # Add Telegram Username-Based Linking

  1. New Tables
    - `telegram_username_links`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `telegram_username` (text, the @username without @)
      - `status` (text: pending, verified, expired)
      - `verification_token` (text, unique token for verification)
      - `created_at` (timestamptz)
      - `expires_at` (timestamptz)
      - `verified_at` (timestamptz, nullable)
  
  2. Changes
    - Allow users to request account linking via username
    - Bot will detect first message from that username and auto-link
    - Tokens expire after 24 hours
  
  3. Security
    - Enable RLS on `telegram_username_links` table
    - Users can only manage their own username links
    - Service role can read all for verification
*/

CREATE TABLE IF NOT EXISTS telegram_username_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  telegram_username text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
  verification_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  verified_at timestamptz,
  UNIQUE(user_id, telegram_username)
);

CREATE INDEX IF NOT EXISTS idx_telegram_username_links_user_id ON telegram_username_links(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_username_links_username ON telegram_username_links(telegram_username);
CREATE INDEX IF NOT EXISTS idx_telegram_username_links_status ON telegram_username_links(status);
CREATE INDEX IF NOT EXISTS idx_telegram_username_links_token ON telegram_username_links(verification_token);

ALTER TABLE telegram_username_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own username links"
  ON telegram_username_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own username links"
  ON telegram_username_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own username links"
  ON telegram_username_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own username links"
  ON telegram_username_links FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can read all username links"
  ON telegram_username_links FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can update all username links"
  ON telegram_username_links FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
