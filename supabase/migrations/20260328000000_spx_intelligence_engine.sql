-- ============================================================================
-- Phase 2: SPX Options Intelligence Engine — Schema
--
-- Creates all supporting tables for:
--   - Price history (rolling window for trend/momentum/VWAP computation)
--   - Wall snapshots (strike wall persistence tracking)
--   - Score snapshots (signal score history)
--   - Signal events (generated trading signals)
--   - Contract candidates (ranked contract sets linked to signals)
--   - Engine state (singleton health/mode record)
--
-- Design principles:
--   - All tables use IF NOT EXISTS guards for idempotent migrations
--   - RLS enabled on all tables; service role bypasses for engine writes
--   - Soft time-series: price_history is pruned to last 4h by a cleanup RPC
--   - Foreign keys are nullable where the relation is optional (signal→candidates)
-- ============================================================================

-- ─── 1. SPX PRICE HISTORY ─────────────────────────────────────────────────────
-- Rolling time-series of SPX index values, used to compute trend, momentum,
-- VWAP approximation, and velocity metrics without a dedicated time-series DB.
-- Rows older than 4 hours are pruned by purge_spx_price_history().

CREATE TABLE IF NOT EXISTS spx_price_history (
  id           BIGSERIAL PRIMARY KEY,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price        NUMERIC(10,2) NOT NULL,
  source       TEXT NOT NULL DEFAULT 'polygon_snapshot',  -- 'polygon_snapshot' | 'streaming'
  session_open NUMERIC(10,2),
  session_high NUMERIC(10,2),
  session_low  NUMERIC(10,2),
  prev_close   NUMERIC(10,2),
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_price_history_captured_at
  ON spx_price_history (captured_at DESC);

-- ─── 2. SPX WALL SNAPSHOTS ───────────────────────────────────────────────────
-- Each row is a wall-engine output snapshot, persisted for persistence scoring
-- and migration detection. The wall engine compares the latest snapshot against
-- the previous N snapshots to compute wall_persistence_score.

CREATE TABLE IF NOT EXISTS spx_wall_snapshots (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  underlying_price        NUMERIC(10,2) NOT NULL,

  -- Call wall
  call_wall_strike        NUMERIC(10,2),
  call_wall_strength      NUMERIC(6,2),    -- 0-100
  call_wall_oi            BIGINT,
  call_wall_volume        BIGINT,
  call_wall_gamma         NUMERIC(14,8),   -- aggregated gamma at strike
  call_wall_state         TEXT,            -- 'holding'|'approached'|'rejected'|'broken'|'unknown'

  -- Put wall
  put_wall_strike         NUMERIC(10,2),
  put_wall_strength       NUMERIC(6,2),
  put_wall_oi             BIGINT,
  put_wall_volume         BIGINT,
  put_wall_gamma          NUMERIC(14,8),
  put_wall_state          TEXT,

  -- Nearest wall summary
  nearest_wall_strike     NUMERIC(10,2),
  nearest_wall_side       TEXT,            -- 'call' | 'put'
  nearest_wall_distance   NUMERIC(8,2),   -- in SPX points
  nearest_wall_strength   NUMERIC(6,2),

  -- Regime
  wall_compression        BOOLEAN DEFAULT FALSE,  -- price trapped between call/put wall
  wall_compression_width  NUMERIC(8,2),           -- points between walls
  wall_migration          BOOLEAN DEFAULT FALSE,
  migration_direction     TEXT,                   -- 'higher'|'lower'|'none'

  -- Aggregate score
  wall_score              NUMERIC(5,2),   -- 0-100

  -- Full serialised output for client use
  full_snapshot           JSONB,
  warnings                TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_spx_wall_snapshots_captured_at
  ON spx_wall_snapshots (captured_at DESC);

-- ─── 3. SPX SCORE SNAPSHOTS ──────────────────────────────────────────────────
-- Persisted sub-score breakdown for each signal computation pass.
-- Used by the Signal Feed and history analytics panels.

CREATE TABLE IF NOT EXISTS spx_score_snapshots (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  underlying_price     NUMERIC(10,2),

  -- Composite
  composite_score      NUMERIC(5,2),  -- 0-100
  confidence_class     TEXT,          -- 'A'|'B'|'C'|'D'|'E'
  direction_bias       TEXT,          -- 'bullish'|'bearish'|'neutral'
  market_mode          TEXT,

  -- Sub-scores
  structure_score      NUMERIC(5,2),
  flow_score           NUMERIC(5,2),
  gamma_score          NUMERIC(5,2),
  wall_score           NUMERIC(5,2),
  iv_score             NUMERIC(5,2),
  execution_score      NUMERIC(5,2),
  time_context_score   NUMERIC(5,2),
  contract_fit_score   NUMERIC(5,2),

  -- Shock overlay
  shock_score          NUMERIC(5,2),
  acceleration_score   NUMERIC(5,2),

  metadata             JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_score_snapshots_captured_at
  ON spx_score_snapshots (captured_at DESC);

-- ─── 4. SPX SIGNAL EVENTS ────────────────────────────────────────────────────
-- Each generated signal is written here as a permanent audit trail.
-- The UI Signal Feed reads from this table.

CREATE TABLE IF NOT EXISTS spx_signal_events (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Signal classification
  signal_type             TEXT NOT NULL,  -- 'BUY_CALL'|'BUY_PUT'|'WATCH_CALL'|'NO_TRADE'|...
  signal_mode             TEXT NOT NULL,  -- 'Trend'|'Breakout'|'Wall_Rejection'|...
  direction_bias          TEXT,           -- 'bullish'|'bearish'|'neutral'
  market_mode             TEXT,

  -- Context at generation time
  underlying_price        NUMERIC(10,2),
  composite_score         NUMERIC(5,2),
  confidence_class        TEXT,

  -- Recommended contract parameters
  recommended_strike      NUMERIC(10,2),
  recommended_expiry      DATE,
  recommended_ticker      TEXT,
  recommended_option_type TEXT,           -- 'call' | 'put'
  target_premium          NUMERIC(10,4),

  -- Rich data
  sub_scores              JSONB,          -- SignalSubScores
  context_snapshot        JSONB,          -- full SPXFeatures at generation
  rationale               TEXT,
  key_factors             TEXT[],
  risks                   TEXT[],

  -- Lifecycle
  expires_at              TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolution_outcome      TEXT           -- 'tp_hit'|'sl_hit'|'expired'|'cancelled'|null
);

CREATE INDEX IF NOT EXISTS idx_spx_signal_events_created_at
  ON spx_signal_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spx_signal_events_signal_type
  ON spx_signal_events (signal_type);

-- ─── 5. SPX CONTRACT CANDIDATES ──────────────────────────────────────────────
-- Each row is one ranked candidate contract evaluated for a signal event.
-- The contract ranker persists best/backup/aggressive/conservative entries.

CREATE TABLE IF NOT EXISTS spx_contract_candidates (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_event_id  UUID REFERENCES spx_signal_events(id) ON DELETE SET NULL,

  ticker           TEXT NOT NULL,
  strike           NUMERIC(10,2),
  expiry           DATE,
  option_type      TEXT,          -- 'call' | 'put'
  dte              SMALLINT,
  dte_regime       TEXT,          -- '0DTE'|'1DTE'|'Weekly'|'Monthly'|'Other'

  -- Pricing
  bid              NUMERIC(10,4),
  ask              NUMERIC(10,4),
  mid              NUMERIC(10,4),
  last_price       NUMERIC(10,4),
  spread_pct       NUMERIC(8,4),  -- (ask-bid)/mid * 100

  -- Chain data
  volume           BIGINT,
  open_interest    BIGINT,

  -- Greeks
  delta            NUMERIC(8,6),
  gamma            NUMERIC(10,8),
  theta            NUMERIC(10,6),
  vega             NUMERIC(10,6),
  iv               NUMERIC(8,6),

  -- Derived scores (0-100)
  liquidity_score        NUMERIC(5,2),
  responsiveness_score   NUMERIC(5,2),
  fit_score              NUMERIC(5,2),
  rank_score             NUMERIC(5,2),
  rank_label             TEXT,           -- 'best'|'backup'|'aggressive'|'conservative'

  estimated_leverage     NUMERIC(8,4),   -- premium / |delta|
  slippage_risk_label    TEXT,           -- 'low'|'medium'|'high'|'very_high'

  metadata         JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_contract_candidates_evaluated_at
  ON spx_contract_candidates (evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_spx_contract_candidates_signal_event_id
  ON spx_contract_candidates (signal_event_id);

-- ─── 6. SPX ENGINE STATE ─────────────────────────────────────────────────────
-- Singleton row tracking engine health and last-run timestamps.
-- Upserted by the intelligence engine on every compute cycle.

CREATE TABLE IF NOT EXISTS spx_engine_state (
  id               TEXT PRIMARY KEY DEFAULT 'singleton',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_running       BOOLEAN NOT NULL DEFAULT FALSE,

  last_feature_at  TIMESTAMPTZ,
  last_signal_at   TIMESTAMPTZ,
  last_wall_at     TIMESTAMPTZ,
  last_shock_at    TIMESTAMPTZ,

  underlying_price NUMERIC(10,2),
  market_mode      TEXT,
  regime_flags     JSONB,   -- { is0DTE, is1DTE, isPreMarket, isPostMarket, isWeekend }

  error_count      INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  metadata         JSONB
);

-- Insert default singleton row (safe if already exists)
INSERT INTO spx_engine_state (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

-- ─── 7. RLS POLICIES ─────────────────────────────────────────────────────────
-- All tables are readable by authenticated users.
-- Writes are restricted to service role (engine / edge functions).

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'spx_price_history',
    'spx_wall_snapshots',
    'spx_score_snapshots',
    'spx_signal_events',
    'spx_contract_candidates',
    'spx_engine_state'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- Allow authenticated users to read
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS "authenticated_read_%s" ON %I
       FOR SELECT TO authenticated USING (true)',
      tbl, tbl
    );

    -- Service role has full access (bypasses RLS by default in Supabase)
  END LOOP;
END $$;

-- ─── 8. MAINTENANCE FUNCTION ─────────────────────────────────────────────────
-- purge_spx_price_history(): Remove price history older than 4 hours.
-- Should be called periodically (e.g. every 30 min from a cron edge function
-- or from the intelligence engine after each compute cycle).

CREATE OR REPLACE FUNCTION purge_spx_price_history(
  p_retain_hours INT DEFAULT 4
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM spx_price_history
  WHERE captured_at < NOW() - (p_retain_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── 9. HELPER VIEW ──────────────────────────────────────────────────────────
-- spx_recent_prices: Last 4h of price history ordered descending.
-- Used by the feature extractor for efficient range queries.

CREATE OR REPLACE VIEW spx_recent_prices AS
  SELECT id, captured_at, price, source, session_open, session_high,
         session_low, prev_close
  FROM   spx_price_history
  WHERE  captured_at > NOW() - INTERVAL '4 hours'
  ORDER  BY captured_at DESC;
