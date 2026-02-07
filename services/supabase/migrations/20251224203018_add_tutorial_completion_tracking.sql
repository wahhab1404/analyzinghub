/*
  # Add Tutorial Completion Tracking

  ## Purpose
  This migration adds functionality to track whether users have completed the tutorial/onboarding.

  ## Changes
  1. New Column
    - Add `tutorial_completed` boolean to profiles table
    - Default value is false for new users
  
  2. Security
    - Users can update their own tutorial completion status
*/

-- Add tutorial_completed column to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'tutorial_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN tutorial_completed boolean DEFAULT false;
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_tutorial_completed 
  ON profiles(tutorial_completed);

-- Update existing users to have tutorial_completed as false
UPDATE profiles SET tutorial_completed = false WHERE tutorial_completed IS NULL;

-- Add comment
COMMENT ON COLUMN profiles.tutorial_completed IS 'Tracks whether user has completed the onboarding tutorial';
