/*
  # Add service role INSERT policy for index_trades

  1. Changes
    - Add INSERT policy for service_role to allow creating trades programmatically
    - This enables standalone trades and automated trade creation
  
  2. Security
    - Only service_role (backend) can use this policy
    - Regular users still need to go through the existing analyzer policy
*/

-- Add service role INSERT policy
CREATE POLICY "Service role can insert trades"
  ON index_trades
  FOR INSERT
  TO service_role
  WITH CHECK (true);
