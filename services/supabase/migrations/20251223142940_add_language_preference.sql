/*
  # Add Language Preference Support

  1. Changes
    - Add `language` column to `profiles` table
      - Stores user's preferred language ('en' or 'ar')
      - Defaults to 'en' (English)
    
  2. Notes
    - This allows users to save their language preference
    - Supports English (en) and Arabic (ar)
*/

-- Add language column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'language'
  ) THEN
    ALTER TABLE profiles ADD COLUMN language text DEFAULT 'en' CHECK (language IN ('en', 'ar'));
  END IF;
END $$;

-- Create index for language lookups
CREATE INDEX IF NOT EXISTS idx_profiles_language ON profiles(language);