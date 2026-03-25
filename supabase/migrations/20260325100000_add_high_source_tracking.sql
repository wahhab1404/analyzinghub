-- ============================================================================
-- Add high_source and manual_high_updated_at to index_trades
--
-- high_source: tracks whether the current highest_price came from a manual
--   edit ('manual') or from the automatic price tracker ('auto').
--   Starts as 'auto' for all existing rows.
--
-- manual_high_updated_at: timestamp of the most recent manual high edit.
--   NULL means no manual edit has been made.
--
-- These two columns are used by:
--  - edit-high API route (sets 'manual' + timestamp on every accepted edit)
--  - update_trade_high_watermark RPC (resets to 'auto' when live price
--    surpasses the stored manual high)
--  - indices-trade-tracker edge function (logs when auto-tracking takes
--    over from a previously manual high)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'high_source'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN high_source TEXT DEFAULT 'auto'
        CHECK (high_source IN ('auto', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'manual_high_updated_at'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN manual_high_updated_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN index_trades.high_source IS
  'Tracks the origin of the current highest recorded contract price. '
  '''manual'' = set by the analyzer via the edit-high or manual-price endpoint. '
  '''auto'' = updated by the automated price tracker (indices-trade-tracker). '
  'Resets to ''auto'' when the live-tracked price surpasses a manually set high.';

COMMENT ON COLUMN index_trades.manual_high_updated_at IS
  'Timestamp of the last manual high watermark edit made via the '
  'edit-high or manual-price (manualHigh) endpoint. NULL = never manually edited.';
