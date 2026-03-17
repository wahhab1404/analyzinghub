-- Add is_test flag to index_trades so test/paper trades can be excluded
-- from the dashboard display and all performance reports.

ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- Index for fast filtering in dashboard/stats queries
CREATE INDEX IF NOT EXISTS idx_index_trades_is_test
  ON index_trades (is_test)
  WHERE is_test = true;

COMMENT ON COLUMN index_trades.is_test IS
  'When true this trade is a paper/test trade and must be excluded from dashboards, stats, and reports.';
