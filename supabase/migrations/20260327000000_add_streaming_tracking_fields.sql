-- ============================================================================
-- Phase 1: Streaming-Based Contract Premium Tracking Fields
--
-- Adds new columns to index_trades to support accurate real-time streaming
-- high/low/MFE/MAE tracking, replacing the old once-per-minute polling model.
--
-- NEW COLUMNS:
--   highest_premium_at        — timestamp when contract_high_since was last set
--   lowest_premium_at         — timestamp when contract_low_since was last set
--   mfe                       — max favorable excursion in dollars (best unrealised P/L)
--   mae                       — max adverse excursion in dollars (worst drawdown from entry)
--   premium_source            — how the current_contract price was derived
--   data_freshness_status     — streaming health: fresh / degraded / stale / unknown
--   last_stream_event_at      — UTC timestamp of the most recent streaming price event
--
-- RATIONALE:
--   The previous design updated contract_high_since once per minute, missing
--   intra-minute peaks. Streaming processes every Polygon quote/trade event
--   as it arrives, updating these fields atomically via the
--   process_streaming_price_update() RPC defined in the next migration.
-- ============================================================================

DO $$
BEGIN
  -- Timestamp when the current high watermark (contract_high_since) was recorded.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'highest_premium_at'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN highest_premium_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- Timestamp when the current low watermark (contract_low_since) was recorded.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'lowest_premium_at'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN lowest_premium_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- Max Favorable Excursion: the maximum profit (in USD) seen at any point
  -- since entry, based on the best streaming-observed price vs entry price.
  --   mfe = (contract_high_since - entry_price) * qty * contract_multiplier
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'mfe'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN mfe NUMERIC(12, 2) DEFAULT NULL;
  END IF;

  -- Max Adverse Excursion: the maximum loss (in USD) seen at any point
  -- since entry, based on the worst streaming-observed price vs entry price.
  --   mae = (entry_price - contract_low_since) * qty * contract_multiplier
  -- A positive value means the trade moved against the entry at its worst.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'mae'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN mae NUMERIC(12, 2) DEFAULT NULL;
  END IF;

  -- Source of the current_contract price value.
  -- Streaming uses a configurable strategy (default: smart_hybrid).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'premium_source'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN premium_source TEXT DEFAULT 'unknown'
        CHECK (premium_source IN ('last_trade','mid','bid','ask','smart_hybrid','manual','unknown','snapshot'));
  END IF;

  -- Streaming freshness indicator. Set by the streaming service and degraded
  -- by the health-check job when events stop arriving.
  --   fresh    — streaming event received in the last 60 seconds
  --   degraded — no event for 60–300 seconds (stream may be reconnecting)
  --   stale    — no event for >300 seconds (fallback to REST polling active)
  --   unknown  — default; streaming has never connected for this trade
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'data_freshness_status'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN data_freshness_status TEXT DEFAULT 'unknown'
        CHECK (data_freshness_status IN ('fresh','degraded','stale','unknown'));
  END IF;

  -- UTC timestamp of the most recent Polygon streaming event processed for
  -- this trade. Used by the health-check job and the edge-function fallback.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'last_stream_event_at'
  ) THEN
    ALTER TABLE index_trades
      ADD COLUMN last_stream_event_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- ── COMMENTS ──────────────────────────────────────────────────────────────────

COMMENT ON COLUMN index_trades.highest_premium_at IS
  'UTC timestamp of when contract_high_since (the highest observed premium) '
  'was last updated by the streaming engine. NULL = never set by streaming.';

COMMENT ON COLUMN index_trades.lowest_premium_at IS
  'UTC timestamp of when contract_low_since (the lowest observed premium) '
  'was last updated by the streaming engine. NULL = never set by streaming.';

COMMENT ON COLUMN index_trades.mfe IS
  'Max Favorable Excursion — the peak unrealised profit in USD since entry, '
  'computed as (contract_high_since - entry_price) × qty × contract_multiplier. '
  'Updated tick-by-tick by process_streaming_price_update(). '
  'For CALL/LONG trades a higher value means a better best-case outcome.';

COMMENT ON COLUMN index_trades.mae IS
  'Max Adverse Excursion — the worst drawdown in USD seen since entry, '
  'computed as (entry_price - contract_low_since) × qty × contract_multiplier. '
  'A positive value means the trade moved against the entry at its worst point. '
  'Updated tick-by-tick by process_streaming_price_update().';

COMMENT ON COLUMN index_trades.premium_source IS
  'Identifies how the current_contract price was derived. '
  '''smart_hybrid'' = best available live data (mid preferred, then last_trade, bid, ask). '
  '''mid'' = (bid + ask) / 2. '
  '''last_trade'' = most recent executed trade price. '
  '''manual'' = overridden by the analyst. '
  '''snapshot'' = Polygon REST snapshot fallback.';

COMMENT ON COLUMN index_trades.data_freshness_status IS
  'Health indicator for the streaming data for this trade. '
  '''fresh'' = streaming event received within 60 s. '
  '''degraded'' = no event for 60–300 s (stream likely reconnecting). '
  '''stale'' = no event for >300 s (edge-function REST fallback active). '
  '''unknown'' = streaming has never been connected for this trade.';

COMMENT ON COLUMN index_trades.last_stream_event_at IS
  'UTC timestamp of the most recent Polygon streaming event (quote or trade) '
  'processed for this contract. Used by health-check logic to decide when '
  'data_freshness_status should be degraded or stale.';

-- ── PERFORMANCE INDEX ─────────────────────────────────────────────────────────

-- Allows the health-check job to quickly find trades that need freshness updates.
CREATE INDEX IF NOT EXISTS idx_index_trades_stream_health
  ON index_trades(status, last_stream_event_at)
  WHERE status = 'active';
