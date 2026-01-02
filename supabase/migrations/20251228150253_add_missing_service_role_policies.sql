/*
  # Add missing service role policies
  
  1. Changes
    - Add service_role policies for subscriptions-related tables
    - Ensure service role can read analyzer_plans for JOIN queries
    - Add policies for telegram_memberships
  
  2. Security
    - Service role has elevated access, these policies make access explicit
    - Existing authenticated user policies remain unchanged
*/

-- Ensure service role can read analyzer_plans (for JOIN in subscriptions query)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'analyzer_plans' 
    AND policyname = 'Service role can read all plans'
  ) THEN
    CREATE POLICY "Service role can read all plans"
      ON analyzer_plans
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- Ensure service role can manage telegram_memberships
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'telegram_memberships' 
    AND policyname = 'Service role can manage memberships'
  ) THEN
    CREATE POLICY "Service role can manage memberships"
      ON telegram_memberships
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
