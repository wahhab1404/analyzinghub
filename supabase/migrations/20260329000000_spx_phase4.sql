-- =============================================================================
-- SPX Intelligence Engine — Phase 4 Migration
-- 20260329000000_spx_phase4.sql
--
-- New tables:
--   1. spx_settings     — singleton config row (one row: id = 'singleton')
--   2. spx_engine_runs  — per-cycle audit log for health monitoring
-- =============================================================================

-- ─── 1. SPX SETTINGS ─────────────────────────────────────────────────────────
-- Singleton configuration for the entire SPX Intelligence Engine.
-- One row is always present with id = 'singleton'.
-- All columns have sensible defaults matching DEFAULT_SETTINGS in settings-engine.ts.

CREATE TABLE IF NOT EXISTS spx_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',

  -- Engine controls
  engine_enabled        BOOLEAN      NOT NULL DEFAULT true,
  paper_mode            BOOLEAN      NOT NULL DEFAULT true,

  -- Score thresholds
  min_score_to_alert    SMALLINT     NOT NULL DEFAULT 60  CHECK (min_score_to_alert  BETWEEN 0 AND 100),
  min_score_to_trade    SMALLINT     NOT NULL DEFAULT 70  CHECK (min_score_to_trade   BETWEEN 0 AND 100),

  -- Contract filters
  min_delta             NUMERIC(5,2) NOT NULL DEFAULT 0.15 CHECK (min_delta >= 0 AND min_delta <= 1),
  max_delta             NUMERIC(5,2) NOT NULL DEFAULT 0.60 CHECK (max_delta >= 0 AND max_delta <= 1),
  max_spread_pct        NUMERIC(5,1) NOT NULL DEFAULT 35.0 CHECK (max_spread_pct > 0),
  min_oi                INTEGER      NOT NULL DEFAULT 100  CHECK (min_oi >= 0),
  min_volume            INTEGER      NOT NULL DEFAULT 50   CHECK (min_volume >= 0),

  -- Expiry preferences
  prefer_0dte           BOOLEAN      NOT NULL DEFAULT true,
  prefer_1dte           BOOLEAN      NOT NULL DEFAULT true,
  prefer_weekly         BOOLEAN      NOT NULL DEFAULT true,
  max_dte               SMALLINT     NOT NULL DEFAULT 7    CHECK (max_dte BETWEEN 0 AND 90),

  -- Wall sensitivity
  wall_strength_threshold  NUMERIC(5,1) NOT NULL DEFAULT 40.0 CHECK (wall_strength_threshold BETWEEN 0 AND 100),
  wall_distance_threshold  NUMERIC(6,1) NOT NULL DEFAULT 20.0 CHECK (wall_distance_threshold > 0),

  -- Shock thresholds
  min_shock_severity    TEXT         NOT NULL DEFAULT 'moderate'
                          CHECK (min_shock_severity IN ('mild','moderate','severe','extreme')),
  min_shock_score       SMALLINT     NOT NULL DEFAULT 30   CHECK (min_shock_score BETWEEN 0 AND 100),

  -- Flow anomaly sensitivity (multiplier: 0.5 = less sensitive, 2.0 = more sensitive)
  flow_anomaly_sensitivity NUMERIC(3,1) NOT NULL DEFAULT 1.0
                             CHECK (flow_anomaly_sensitivity BETWEEN 0.1 AND 5.0),

  -- Telegram toggles
  telegram_enabled      BOOLEAN      NOT NULL DEFAULT true,
  telegram_send_signals BOOLEAN      NOT NULL DEFAULT true,
  telegram_send_shock   BOOLEAN      NOT NULL DEFAULT true,
  telegram_send_wall    BOOLEAN      NOT NULL DEFAULT true,
  telegram_send_trade   BOOLEAN      NOT NULL DEFAULT true,

  -- Alert deduplication windows (seconds)
  dedup_new_signal_s    INTEGER      NOT NULL DEFAULT 300  CHECK (dedup_new_signal_s  >= 0),
  dedup_shock_warning_s INTEGER      NOT NULL DEFAULT 180  CHECK (dedup_shock_warning_s >= 0),
  dedup_wall_alert_s    INTEGER      NOT NULL DEFAULT 300  CHECK (dedup_wall_alert_s   >= 0),
  dedup_exit_alert_s    INTEGER      NOT NULL DEFAULT 120  CHECK (dedup_exit_alert_s   >= 0),

  -- Active trading hours (Eastern Time, 24h format, 0–23)
  active_hour_start     SMALLINT     NOT NULL DEFAULT 9    CHECK (active_hour_start BETWEEN 0 AND 23),
  active_hour_end       SMALLINT     NOT NULL DEFAULT 16   CHECK (active_hour_end   BETWEEN 0 AND 23),

  -- Data / premium source
  premium_source        TEXT         NOT NULL DEFAULT 'polygon'
                          CHECK (premium_source IN ('polygon','cboe')),
  stale_data_threshold_s INTEGER     NOT NULL DEFAULT 120  CHECK (stale_data_threshold_s > 0),

  -- Replay defaults
  replay_speed          NUMERIC(4,1) NOT NULL DEFAULT 1.0  CHECK (replay_speed BETWEEN 0.1 AND 100.0),
  replay_default_days_back SMALLINT  NOT NULL DEFAULT 5    CHECK (replay_default_days_back BETWEEN 1 AND 365),

  -- Audit
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by            TEXT
);

-- Insert the singleton row if it doesn't exist yet
INSERT INTO spx_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE spx_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spx_settings' AND policyname = 'spx_settings_auth_read'
  ) THEN
    CREATE POLICY spx_settings_auth_read
      ON spx_settings FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spx_settings' AND policyname = 'spx_settings_service_all'
  ) THEN
    CREATE POLICY spx_settings_service_all
      ON spx_settings FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─── 2. SPX ENGINE RUNS ───────────────────────────────────────────────────────
-- One row per intelligence engine cycle. Used by the Health panel and
-- analytics to compute success rate, average latency, and error patterns.
-- Older rows are pruned by the maintenance function below (retain 7 days).

CREATE TABLE IF NOT EXISTS spx_engine_runs (
  id           BIGSERIAL    PRIMARY KEY,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  duration_ms  INTEGER      NOT NULL,
  success      BOOLEAN      NOT NULL,
  signal_type  TEXT,
  market_mode  TEXT,
  spx_price    NUMERIC(10,2),
  data_quality TEXT         CHECK (data_quality IN ('high','medium','low')),
  error_msg    TEXT
);

CREATE INDEX IF NOT EXISTS idx_spx_engine_runs_created_at
  ON spx_engine_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spx_engine_runs_success
  ON spx_engine_runs (success, created_at DESC);

-- RLS
ALTER TABLE spx_engine_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spx_engine_runs' AND policyname = 'spx_engine_runs_auth_read'
  ) THEN
    CREATE POLICY spx_engine_runs_auth_read
      ON spx_engine_runs FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'spx_engine_runs' AND policyname = 'spx_engine_runs_service_all'
  ) THEN
    CREATE POLICY spx_engine_runs_service_all
      ON spx_engine_runs FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ─── 3. MAINTENANCE FUNCTION ──────────────────────────────────────────────────
-- Prune old engine run rows to keep the table small.
-- Called from the intelligence engine (or a scheduled edge function).

CREATE OR REPLACE FUNCTION purge_spx_engine_runs(
  p_retain_days INT DEFAULT 7
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM spx_engine_runs
  WHERE created_at < NOW() - (p_retain_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
