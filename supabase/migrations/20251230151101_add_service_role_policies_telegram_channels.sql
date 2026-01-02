/*
  # Add Service Role Policies for Telegram Channels

  1. Changes
    - Add service_role policies for telegram_channels table
    - Allow service role to SELECT, INSERT, UPDATE, and DELETE on telegram_channels
  
  2. Security
    - Service role has elevated access for backend operations
    - Existing RLS policies for authenticated users remain unchanged
    - Enables API routes to manage channels on behalf of users
*/

-- Add service_role SELECT policy for telegram_channels
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_channels' 
    AND policyname = 'Service role can read telegram channels'
  ) THEN
    CREATE POLICY "Service role can read telegram channels"
      ON telegram_channels FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- Add service_role INSERT policy for telegram_channels
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_channels' 
    AND policyname = 'Service role can insert telegram channels'
  ) THEN
    CREATE POLICY "Service role can insert telegram channels"
      ON telegram_channels FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

-- Add service_role UPDATE policy for telegram_channels
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_channels' 
    AND policyname = 'Service role can update telegram channels'
  ) THEN
    CREATE POLICY "Service role can update telegram channels"
      ON telegram_channels FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Add service_role DELETE policy for telegram_channels
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_channels' 
    AND policyname = 'Service role can delete telegram channels'
  ) THEN
    CREATE POLICY "Service role can delete telegram channels"
      ON telegram_channels FOR DELETE
      TO service_role
      USING (true);
  END IF;
END $$;