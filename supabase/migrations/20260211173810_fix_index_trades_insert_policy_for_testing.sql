/*
  # Fix Index Trades INSERT Policy for Testing Mode
  
  ## Changes
  - Updates INSERT policy to allow creating test trades
  - Test trades don't need to be associated with an analysis
  - Ensures proper authorization for test trade creation
  
  ## Security
  - Users can only create trades they author
  - Test trades follow same ownership rules as regular trades
*/

-- Drop existing conflicting INSERT policies
DROP POLICY IF EXISTS "Analyzers can create trades for own analyses" ON index_trades;
DROP POLICY IF EXISTS "Service role can insert trades" ON index_trades;

-- Create new comprehensive INSERT policy
CREATE POLICY "Users can create own trades"
  ON index_trades
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      -- Regular trades must be associated with an analysis
      (is_testing = false AND analysis_id IS NOT NULL)
      -- Test trades don't need an analysis association
      OR (is_testing = true)
    )
  );

-- Service role can insert any trades
CREATE POLICY "Service role can insert trades"
  ON index_trades
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON POLICY "Users can create own trades" ON index_trades IS 'Users can create their own trades. Test trades dont need analysis association.';
