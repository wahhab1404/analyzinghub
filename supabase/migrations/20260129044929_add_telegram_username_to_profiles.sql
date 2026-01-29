/*
  # Add Telegram Username to Profiles

  1. Changes
    - Add `telegram_username` column to profiles table
    - This stores the user's Telegram username (without @) for easy bot communication
    - Used for channel invitations and subscription management

  2. Notes
    - Username is optional (can be null)
    - Should be unique when present
    - Used by subscription system to send channel invites
    - Used by expiration system to remove users from channels
*/

-- Add telegram_username column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'telegram_username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN telegram_username text;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_username ON profiles(telegram_username) WHERE telegram_username IS NOT NULL;

-- Add unique constraint (allow multiple nulls)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_telegram_username_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_telegram_username_key UNIQUE (telegram_username);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Function to sync telegram_username from telegram_accounts
CREATE OR REPLACE FUNCTION sync_telegram_username()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update profiles with username from telegram_accounts if not already set
  UPDATE profiles p
  SET telegram_username = ta.username
  FROM telegram_accounts ta
  WHERE p.id = ta.user_id
    AND p.telegram_username IS NULL
    AND ta.username IS NOT NULL
    AND ta.revoked_at IS NULL;
END;
$$;

-- Run the sync function once to populate existing data
SELECT sync_telegram_username();
