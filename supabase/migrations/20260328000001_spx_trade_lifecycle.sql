-- ============================================================================
-- Phase 3: SPX Trade Lifecycle — Schema
--
-- Creates tables for tracking the full lifecycle of an SPX options trade,
-- from signal detection through entry, management, and final outcome.
--
-- Tables:
--   spx_trades          — one row per trade, state-machine driven
--   spx_exit_events     — log of every exit signal emitted for a trade
--   spx_alert_log       — deduplication log for all Telegram/webhook alerts
--
-- Design principles:
--   - Idempotent: all CREATE TABLE / CREATE INDEX use IF NOT EXISTS
--   - RLS: authenticated users can SELECT; service role writes (bypasses RLS)
--   - FK to spx_signal_events and spx_contract_candidates use ON DELETE SET NULL
--     so that pruning Phase 2 history does not orphan trade rows
-- ============================================================================

-- ─── 1. SPX TRADES ───────────────────────────────────────────────────────────
-- Central trade record. Progresses through a state machine:
--
--   detected → candidate → confirmed → alerted → entered → active
--     → partially_exited → closed_win | closed_loss | expired
--   Any state → invalidated | cancelled
--
-- Premium extremes, MFE, MAE and P/L are updated after every engine cycle.

CREATE TABLE IF NOT EXISTS spx_trades (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Links to Phase 2 output
  signal_event_id         UUID REFERENCES spx_signal_events(id) ON DELETE SET NULL,
  contract_candidate_id   UUID REFERENCES spx_contract_candidates(id) ON DELETE SET NULL,

  -- Contract identity
  ticker                  TEXT,
  strike                  NUMERIC(10,2),
  expiry                  DATE,
  option_type             TEXT,                 -- 'call' | 'put'
  dte                     SMALLINT,

  -- State machine
  state                   TEXT NOT NULL DEFAULT 'detected'
    CHECK (state IN (
      'detected','candidate','confirmed','alerted','entered','active',
      'partially_exited','closed_win','closed_loss','expired',
      'invalidated','cancelled'
    )),

  -- Entry
  entry_timestamp         TIMESTAMPTZ,
  entry_premium           NUMERIC(10,4),
  entry_spx_price         NUMERIC(10,2),
  suggested_entry_low     NUMERIC(10,4),
  suggested_entry_high    NUMERIC(10,4),

  -- Live premium tracking
  current_premium         NUMERIC(10,4),
  current_spx_price       NUMERIC(10,2),
  premium_updated_at      TIMESTAMPTZ,

  -- Extreme tracking
  highest_premium         NUMERIC(10,4),
  lowest_premium          NUMERIC(10,4),
  highest_premium_at      TIMESTAMPTZ,
  lowest_premium_at       TIMESTAMPTZ,

  -- Risk levels
  stop_premium            NUMERIC(10,4),        -- premium-based stop-loss level
  hard_stop_spx           NUMERIC(10,2),        -- underlying price hard stop
  soft_stop_conditions    TEXT[],               -- soft invalidation condition labels

  -- Profit targets (premium-based)
  target_1_premium        NUMERIC(10,4),
  target_2_premium        NUMERIC(10,4),
  target_3_premium        NUMERIC(10,4),
  runner_premium          NUMERIC(10,4),

  -- Time stop
  time_stop_at            TIMESTAMPTZ,

  -- Performance
  mfe                     NUMERIC(10,4),        -- maximum favourable excursion (%)
  mae                     NUMERIC(10,4),        -- maximum adverse excursion (%)
  realized_pnl_pct        NUMERIC(8,4),         -- final realised P/L %
  unrealized_pnl_pct      NUMERIC(8,4),         -- live unrealised P/L %

  -- Exit
  exit_timestamp          TIMESTAMPTZ,
  exit_premium            NUMERIC(10,4),
  exit_spx_price          NUMERIC(10,2),
  exit_reason             TEXT,

  -- Outcome classification
  final_score_outcome     TEXT
    CHECK (final_score_outcome IN (
      'big_win','small_win','breakeven','small_loss','big_loss',NULL
    )),

  -- Signal context snapshot (denormalised for fast read)
  composite_score         NUMERIC(5,2),
  confidence_class        TEXT,
  signal_mode             TEXT,
  direction_bias          TEXT,

  -- Audit / debug
  invalidation_notes      TEXT[],
  metadata                JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_trades_state
  ON spx_trades (state);

CREATE INDEX IF NOT EXISTS idx_spx_trades_created_at
  ON spx_trades (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spx_trades_signal_event_id
  ON spx_trades (signal_event_id);

-- ─── 2. SPX EXIT EVENTS ──────────────────────────────────────────────────────
-- Immutable log of every exit signal the exit engine emits for a trade.
-- Multiple exit signals can exist for one trade (e.g. partial + final).

CREATE TABLE IF NOT EXISTS spx_exit_events (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  trade_id          UUID NOT NULL REFERENCES spx_trades(id) ON DELETE CASCADE,
  signal_event_id   UUID REFERENCES spx_signal_events(id) ON DELETE SET NULL,

  exit_type         TEXT NOT NULL
    CHECK (exit_type IN (
      'EXIT_CALL','EXIT_PUT','REDUCE_POSITION','TRAIL_STOP_UPDATE',
      'WALL_FAILURE_EXIT','TIME_DECAY_EXIT','VOLATILITY_EXIT',
      'MOMENTUM_FAILURE_EXIT'
    )),

  spx_price         NUMERIC(10,2),
  contract_premium  NUMERIC(10,4),

  reason            TEXT,
  metadata          JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_exit_events_trade_id
  ON spx_exit_events (trade_id);

CREATE INDEX IF NOT EXISTS idx_spx_exit_events_created_at
  ON spx_exit_events (created_at DESC);

-- ─── 3. SPX ALERT LOG ────────────────────────────────────────────────────────
-- Deduplication and audit log for all outbound alerts (Telegram, webhooks, etc).
-- dedup_key is used to suppress duplicate alerts within a cooldown window;
-- it is not enforced as UNIQUE at the DB level to allow multiple firings to
-- be recorded — the engine checks recency by querying on dedup_key + created_at.

CREATE TABLE IF NOT EXISTS spx_alert_log (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  alert_type        TEXT NOT NULL
    CHECK (alert_type IN (
      'new_signal','shock_warning','wall_break','wall_rejection',
      'entry_confirmed','target_hit','stop_hit','trade_closed','exit_alert'
    )),

  -- Deduplication key — format: '<alert_type>:<trade_id|signal_id>:<qualifier>'
  -- e.g. 'target_hit:abc123:T1' or 'stop_hit:abc123'
  dedup_key         TEXT,

  -- Related records
  signal_event_id   UUID REFERENCES spx_signal_events(id) ON DELETE SET NULL,
  trade_id          UUID REFERENCES spx_trades(id) ON DELETE SET NULL,

  -- Delivery tracking
  channel_count     INT DEFAULT 0,              -- how many channels were sent to
  suppressed        BOOLEAN DEFAULT FALSE,
  suppress_reason   TEXT,

  -- Content preview
  message_preview   TEXT,
  metadata          JSONB
);

CREATE INDEX IF NOT EXISTS idx_spx_alert_log_dedup_key
  ON spx_alert_log (dedup_key);

CREATE INDEX IF NOT EXISTS idx_spx_alert_log_created_at
  ON spx_alert_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spx_alert_log_alert_type
  ON spx_alert_log (alert_type);

-- ─── 4. RLS POLICIES ─────────────────────────────────────────────────────────
-- Authenticated users can read all three tables.
-- Writes are restricted to service role (engine / edge functions).
-- Uses pg_policies existence check instead of CREATE POLICY IF NOT EXISTS
-- (which is not available in all Postgres versions).

DO $$
DECLARE
  tbl TEXT;
  pol TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['spx_trades','spx_exit_events','spx_alert_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    pol := 'authenticated_read_' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = pol
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
        pol, tbl
      );
    END IF;
  END LOOP;
END $$;
