/*
  # Add service role policy for roles table
  
  1. Changes
    - Add policy allowing service_role to select from roles table
    - This ensures scripts using service role key can query roles
  
  2. Security
    - Only affects service_role (used by backend scripts)
    - Does not change access for regular users
*/

-- Drop existing policy if it exists
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can view roles" ON roles;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Add service role policy for roles table
CREATE POLICY "Service role can view roles"
  ON roles
  FOR SELECT
  TO service_role
  USING (true);
