/*
  # Add Testing Mode Support to Index Trades
  
  ## Changes
  - Adds `is_testing` column to `index_trades` table
  - Defaults to false for existing trades
  - Excludes test trades from reports and statistics
  
  ## Notes
  - Test trades are visible only to the trade owner
  - Used for testing trade workflows before publishing to real subscribers
*/

-- Add is_testing column to index_trades
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'index_trades' AND column_name = 'is_testing'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN is_testing boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_index_trades_testing
  ON index_trades(author_id, is_testing);

-- Update RLS policy to handle testing trades
DROP POLICY IF EXISTS "Index trades visible based on testing mode" ON index_trades;

CREATE POLICY "Index trades visible based on testing mode"
  ON index_trades
  FOR SELECT
  TO authenticated
  USING (
    (is_testing = false)
    OR (is_testing = true AND author_id = auth.uid())
    OR (is_testing = true AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.name IN ('SuperAdmin', 'Admin')
    ))
  );

COMMENT ON COLUMN index_trades.is_testing IS 'If true, excluded from all stats/reports and visible only to owner';
