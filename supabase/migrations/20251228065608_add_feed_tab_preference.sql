/*
  # Add Feed Tab Preference

  1. Changes
    - Add `feed_tab_preference` column to profiles table
      - Stores user's last selected feed tab ('recommended', 'global', or 'following')
      - Defaults to 'recommended' for new users
    
  2. Notes
    - This allows the system to remember which tab the user was viewing
    - Enhances user experience by restoring their last view
*/

-- Add feed tab preference column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'feed_tab_preference'
  ) THEN
    ALTER TABLE profiles 
    ADD COLUMN feed_tab_preference text DEFAULT 'recommended' 
    CHECK (feed_tab_preference IN ('recommended', 'global', 'following'));
  END IF;
END $$;

-- Update existing users to have recommended as default
UPDATE profiles 
SET feed_tab_preference = 'recommended' 
WHERE feed_tab_preference IS NULL;

COMMENT ON COLUMN profiles.feed_tab_preference IS 'User''s preferred feed tab (recommended, global, or following)';
