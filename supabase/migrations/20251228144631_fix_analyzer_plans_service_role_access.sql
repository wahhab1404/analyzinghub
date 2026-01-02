/*
  # Fix analyzer_plans service role access
  
  1. Changes
    - Add service_role SELECT policy for analyzer_plans
    - This ensures API routes using service role key can access plans
  
  2. Security
    - Service role already has full access, this makes it explicit
    - Existing RLS policies for authenticated users remain unchanged
*/

-- Add service_role SELECT policy
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analyzer_plans' 
    AND policyname = 'Service role can view all plans'
  ) THEN
    CREATE POLICY "Service role can view all plans"
      ON analyzer_plans
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;
