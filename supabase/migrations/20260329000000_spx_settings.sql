-- ============================================================================
-- Phase 4: SPX Settings, Analytics Views, and Health Infrastructure
-- Migration: 20260329000000_spx_settings
-- ============================================================================

-- ─── 1. SPX SETTINGS (singleton row) ─────────────────────────────────────────
-- One row per installation (id = 'singleton').
-- All settings are hot-reloaded by the intelligence engine on each cycle.

CREATE TABLE IF NOT EXISTS spx_settings (
  id                        TEXT PRIMARY KEY DEFAULT 'singleton',

  -- Engine controls
  engine_enabled            BOOLEAN         NOT NULL DEFAULT true,
  paper_mode                BOOLEAN         NOT NULL DEFAULT true,

  -- Score thresholds
  min_score_to_alert        INTEGER         NOT NULL DEFAULT 60
                              CHECK (min_score_to_alert BETWEEN 0 AND 100),
  min_score_to_trade        INTEGER         NOT NULL DEFAULT 70
                              CHECK (min_score_to_trade BETWEEN 0 AND 100),

  -- Contract filter: delta range
  min_delta                 NUMERIC(5,2)    NOT NULL DEFAULT 0.15
                              CHECK (min_delta BETWEEN 0 AND 1),
  max_delta                 NUMERIC(5,2)    NOT NULL DEFAULT 0.60
                              CHECK (max_delta BETWEEN 0 AND 1),

  -- Contract filter: spread / liquidity
  max_spread_pct            NUMERIC(5,1)    NOT NULL DEFAULT 35.0
                              CHECK (max_spread_pct > 0),
  min_oi                    INTEGER         NOT NULL DEFAULT 100
                              CHECK (min_oi >= 0),
  min_volume                INTEGER         NOT NULL DEFAULT 50
                              CHECK (min_volume >= 0),

  -- Expiry preferences
  prefer_0dte               BOOLEAN         NOT NULL DEFAULT true,
  prefer_1dte               BOOLEAN         NOT NULL DEFAULT true,
  prefer_weekly             BOOLEAN         NOT NULL DEFAULT true,
  max_dte                   INTEGER         NOT NULL DEFAULT 7
                              CHECK (max_dte BETWEEN 0 AND 365),

  -- Wall engine sensitivity
  wall_strength_threshold   NUMERIC(5,1)    NOT NULL DEFAULT 40.0
                              CHECK (wall_strength_threshold BETWEEN 0 AND 100),
  wall_distance_threshold   NUMERIC(6,1)    NOT NULL DEFAULT 20.0
                              CHECK (wall_distance_threshold > 0),

  -- Shock engine thresholds
  min_shock_severity        TEXT            NOT NULL DEFAULT 'moderate'
                              CHECK (min_shock_severity IN ('mild','moderate','severe','extreme')),
  min_shock_score           INTEGER         NOT NULL DEFAULT 30
                              CHECK (min_shock_score BETWEEN 0 AND 100),

  -- Flow anomaly sensitivity (multiplier: 0.5 = less sensitive, 2.0 = more sensitive)
  flow_anomaly_sensitivity  NUMERIC(3,1)    NOT NULL DEFAULT 1.0
                              CHECK (flow_anomaly_sensitivity BETWEEN 0.1 AND 5.0),

  -- Telegram controls
  telegram_enabled          BOOLEAN         NOT NULL DEFAULT true,
  telegram_send_signals     BOOLEAN         NOT NULL DEFAULT true,
  telegram_send_shock       BOOLEAN         NOT NULL DEFAULT true,
  telegram_send_wall        BOOLEAN         NOT NULL DEFAULT true,
  telegram_send_trade       BOOLEAN         NOT NULL DEFAULT true,

  -- Alert deduplication windows (seconds)
  dedup_new_signal_s        INTEGER         NOT NULL DEFAULT 300
                              CHECK (dedup_new_signal_s >= 0),
  dedup_shock_warning_s     INTEGER         NOT NULL DEFAULT 180
                              CHECK (dedup_shock_warning_s >= 0),
  dedup_wall_alert_s        INTEGER         NOT NULL DEFAULT 300
                              CHECK (dedup_wall_alert_s >= 0),
  dedup_exit_alert_s        INTEGER         NOT NULL DEFAULT 120
                              CHECK (dedup_exit_alert_s >= 0),

  -- Active trading hours (Eastern Time, 0–23)
  active_hour_start         INTEGER         NOT NULL DEFAULT 9
                              CHECK (active_hour_start BETWEEN 0 AND 23),
  active_hour_end           INTEGER         NOT NULL DEFAULT 16
                              CHECK (active_hour_end BETWEEN 0 AND 23),

  -- Data source and staleness
  premium_source            TEXT            NOT NULL DEFAULT 'polygon'
                              CHECK (premium_source IN ('polygon','cboe','manual')),
  stale_data_threshold_s    INTEGER         NOT NULL DEFAULT 120
                              CHECK (stale_data_threshold_s > 0),

  -- Replay/backtest defaults
  replay_speed              NUMERIC(4,1)    NOT NULL DEFAULT 1.0
                              CHECK (replay_speed BETWEEN 0.1 AND 100),
  replay_default_days_back  INTEGER         NOT NULL DEFAULT 5
                              CHECK (replay_default_days_back BETWEEN 1 AND 90),

  updated_at                TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_by                TEXT
);

-- Seed the singleton row
INSERT INTO spx_settings (id) VALUES ('singleton')
  ON CONFLICT (id) DO NOTHING;

-- ─── 2. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE spx_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'spx_settings' AND policyname = 'spx_settings_read'
  ) THEN
    CREATE POLICY spx_settings_read ON spx_settings
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'spx_settings' AND policyname = 'spx_settings_write'
  ) THEN
    CREATE POLICY spx_settings_write ON spx_settings
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 3. ENGINE RUN LOG ────────────────────────────────────────────────────────
-- Lightweight log of each engine execution for health/ops monitoring.

CREATE TABLE IF NOT EXISTS spx_engine_runs (
  id           BIGSERIAL    PRIMARY KEY,
  ran_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  duration_ms  INTEGER,
  success      BOOLEAN      NOT NULL,
  signal_type  TEXT,
  market_mode  TEXT,
  spx_price    NUMERIC(10,2),
  error_msg    TEXT,
  data_quality TEXT         CHECK (data_quality IN ('high','medium','low'))
);

CREATE INDEX IF NOT EXISTS idx_spx_engine_runs_ran_at
  ON spx_engine_runs (ran_at DESC);

ALTER TABLE spx_engine_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'spx_engine_runs' AND policyname = 'spx_engine_runs_read'
  ) THEN
    CREATE POLICY spx_engine_runs_read ON spx_engine_runs
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'spx_engine_runs' AND policyname = 'spx_engine_runs_write'
  ) THEN
    CREATE POLICY spx_engine_runs_write ON spx_engine_runs
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 4. ANALYTICS VIEWS ──────────────────────────────────────────────────────

-- Signal performance summary view
CREATE OR REPLACE VIEW spx_signal_performance AS
SELECT
  se.id,
  se.created_at,
  se.signal_type,
  se.signal_mode,
  se.direction_bias,
  se.market_mode,
  se.composite_score,
  se.confidence_class,
  se.resolution_outcome,
  se.resolved_at,
  -- Join in trade data if a trade was opened from this signal
  t.id              AS trade_id,
  t.state           AS trade_state,
  t.entry_premium,
  t.exit_premium,
  t.realized_pnl_pct,
  t.unrealized_pnl_pct,
  t.max_favorable_excursion,
  t.max_adverse_excursion,
  t.option_type     AS contract_type,
  t.dte_at_entry,
  t.final_score_outcome,
  t.closed_at,
  EXTRACT(HOUR FROM se.created_at AT TIME ZONE 'America/New_York') AS signal_hour_et,
  DATE_TRUNC('day', se.created_at) AS signal_date
FROM spx_signal_events se
LEFT JOIN spx_trades t ON t.signal_event_id = se.id;

-- ─── 5. PURGE FUNCTION FOR ENGINE RUNS ───────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_spx_engine_runs(p_retain_days INT DEFAULT 30)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM spx_engine_runs
  WHERE ran_at < NOW() - (p_retain_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
