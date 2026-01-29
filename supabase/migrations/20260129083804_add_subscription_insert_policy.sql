/*
  # Add INSERT Policy for Subscriptions
  
  1. Changes
    - Add INSERT policy for authenticated users to create subscriptions
    - Allow users to subscribe to any active plan (the API validates ownership and limits)
  
  2. Security
    - Policy allows authenticated users to insert subscriptions
    - Backend validation ensures users can't subscribe to their own plans
    - Backend validation ensures max_subscribers limits are respected
*/

-- Add policy for users to create subscriptions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'subscriptions' 
    AND policyname = 'Users can create subscriptions'
  ) THEN
    CREATE POLICY "Users can create subscriptions"
      ON subscriptions
      FOR INSERT
      TO authenticated
      WITH CHECK (subscriber_id = auth.uid());
  END IF;
END $$;
