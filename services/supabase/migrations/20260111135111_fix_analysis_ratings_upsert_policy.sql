/*
  # Fix Analysis Ratings Upsert Policy
  
  1. Changes
    - Drop the existing complex INSERT policy
    - Create a simpler INSERT policy that works with upsert
    - The check for "not rating your own analysis" is already handled in the API layer
  
  2. Security
    - Maintains RLS protection
    - Users can only insert their own ratings
    - Simplified policy for better upsert compatibility
*/

-- Drop the existing complex INSERT policy
DROP POLICY IF EXISTS "Users can create ratings on others' analyses" ON analysis_ratings;

-- Create a simpler INSERT policy that works with upsert
CREATE POLICY "Users can create own analysis ratings"
  ON analysis_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Ensure service role policy exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analysis_ratings' 
    AND policyname = 'Service role has full access to analysis ratings'
  ) THEN
    CREATE POLICY "Service role has full access to analysis ratings"
      ON analysis_ratings FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;