/*
  # Add service role UPDATE policy for analyzer_plans

  1. Changes
    - Add service_role UPDATE policy for analyzer_plans table
    - Allows API routes using service role to update plans
  
  2. Security
    - Service role already validates ownership in API code
    - This makes the elevated access explicit
    - Existing authenticated user policies remain unchanged
*/

-- Add service role UPDATE policy for analyzer_plans
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analyzer_plans' 
    AND policyname = 'Service role can update plans'
  ) THEN
    CREATE POLICY "Service role can update plans"
      ON analyzer_plans
      FOR UPDATE
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
