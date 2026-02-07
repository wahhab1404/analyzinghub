/*
  # Add service role SELECT policy for profiles

  1. Changes
    - Add SELECT policy for service_role on profiles table
    - This allows the service role to read profiles after creation
    
  2. Security
    - Only service_role has this permission
    - Needed for admin user management functionality
*/

-- Allow service_role to read all profiles
DROP POLICY IF EXISTS "Service role can read all profiles" ON profiles;
CREATE POLICY "Service role can read all profiles"
  ON profiles
  FOR SELECT
  TO service_role
  USING (true);
