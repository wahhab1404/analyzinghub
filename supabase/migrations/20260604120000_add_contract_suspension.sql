-- ─────────────────────────────────────────────────────────────────────────────
-- Contract Suspension Feature  |  ميزة وقف العقود
--
-- Adds a "suspended" lifecycle state to every trade/contract system so an
-- analyzer (or, later, an automated rule) can stop the platform from tracking a
-- contract while keeping the row around. Suspended contracts are excluded from
-- every price-tracking / auto-close query because those filters only look at
-- the live statuses ('active', 'published', and the SPX active states) — so no
-- tracker change is required, only the new status value + audit columns.
--
-- Covers all three systems:
--   1. index_trades   (Indices Hub — text status + named CHECK)
--   2. trades         (unified module — trade_status_enum)
--   3. spx_trades     (SPX engine — text state + inline CHECK)
--
-- Plus the alert/outbox plumbing needed to send a Telegram suspension notice.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Shared audit columns helper values ───────────────────────────────────────
-- suspended_at        : when the contract was suspended
-- suspended_by        : profile that performed a manual suspension (NULL = auto)
-- suspension_reason   : free-text reason shown in the alert
-- suspension_mode     : 'manual' | 'auto' — how the suspension was triggered

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. index_trades  (Indices Hub)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Extend the status CHECK with 'suspended'
  ALTER TABLE index_trades DROP CONSTRAINT IF EXISTS valid_status;
  ALTER TABLE index_trades ADD CONSTRAINT valid_status
    CHECK (status IN ('draft', 'active', 'tp_hit', 'sl_hit', 'closed', 'canceled', 'expired', 'suspended'));

  -- Audit columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'index_trades' AND column_name = 'suspended_at') THEN
    ALTER TABLE index_trades ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'index_trades' AND column_name = 'suspended_by') THEN
    ALTER TABLE index_trades ADD COLUMN suspended_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'index_trades' AND column_name = 'suspension_reason') THEN
    ALTER TABLE index_trades ADD COLUMN suspension_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'index_trades' AND column_name = 'suspension_mode') THEN
    ALTER TABLE index_trades ADD COLUMN suspension_mode TEXT
      CHECK (suspension_mode IN ('manual', 'auto'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. trades  (unified module — enum-backed)
--
-- NOTE: the 'suspended' value for trade_status_enum (and 'suspended'/'resumed'
-- for trade_alert_type_enum) are added in the companion migration
-- 20260604119000_add_suspended_enum_values.sql, which MUST run first — Postgres
-- forbids using a freshly-added enum value (e.g. the partial index below) in the
-- same transaction that adds it.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'trades' AND column_name = 'suspended_at') THEN
    ALTER TABLE trades ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'trades' AND column_name = 'suspended_by') THEN
    ALTER TABLE trades ADD COLUMN suspended_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'trades' AND column_name = 'suspension_reason') THEN
    ALTER TABLE trades ADD COLUMN suspension_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'trades' AND column_name = 'suspension_mode') THEN
    ALTER TABLE trades ADD COLUMN suspension_mode TEXT
      CHECK (suspension_mode IN ('manual', 'auto'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. spx_trades  (SPX engine — inline state CHECK)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Inline CHECK constraints are auto-named "<table>_<column>_check"
  ALTER TABLE spx_trades DROP CONSTRAINT IF EXISTS spx_trades_state_check;
  ALTER TABLE spx_trades ADD CONSTRAINT spx_trades_state_check
    CHECK (state IN (
      'detected','candidate','confirmed','alerted','entered','active',
      'partially_exited','closed_win','closed_loss','expired',
      'invalidated','cancelled','suspended'
    ));

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spx_trades' AND column_name = 'suspended_at') THEN
    ALTER TABLE spx_trades ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spx_trades' AND column_name = 'suspended_by') THEN
    ALTER TABLE spx_trades ADD COLUMN suspended_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spx_trades' AND column_name = 'suspension_reason') THEN
    ALTER TABLE spx_trades ADD COLUMN suspension_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'spx_trades' AND column_name = 'suspension_mode') THEN
    ALTER TABLE spx_trades ADD COLUMN suspension_mode TEXT
      CHECK (suspension_mode IN ('manual', 'auto'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Alert plumbing
-- ═══════════════════════════════════════════════════════════════════════════

-- 4a. telegram_outbox — allow the suspension/resume message types. The previous
--     CHECK was already out of sync with reality (the app queues 'trade_closed',
--     'company_*', etc.), so recreate it with the full, accurate set.
DO $$
BEGIN
  ALTER TABLE telegram_outbox DROP CONSTRAINT IF EXISTS valid_message_type;
  ALTER TABLE telegram_outbox ADD CONSTRAINT valid_message_type
    CHECK (message_type IN (
      'new_analysis', 'new_trade', 'analysis_update', 'trade_update',
      'trade_result', 'new_high', 'target_hit', 'stop_hit',
      'trade_closed', 'trade_closed_for_new_entry', 'trade_entry_averaged',
      'winning_trade', 'milestone', 'channel_invite',
      'company_new_trade', 'company_new_high', 'company_winning_trade',
      'trade_suspended', 'trade_resumed'
    ));
END $$;

-- 4b. spx_alert_log — allow the suspension/resume alert types.
DO $$
BEGIN
  ALTER TABLE spx_alert_log DROP CONSTRAINT IF EXISTS spx_alert_log_alert_type_check;
  ALTER TABLE spx_alert_log ADD CONSTRAINT spx_alert_log_alert_type_check
    CHECK (alert_type IN (
      'new_signal','shock_warning','wall_break','wall_rejection',
      'entry_confirmed','target_hit','stop_hit','trade_closed','exit_alert',
      'trade_suspended','trade_resumed'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Helpful partial indexes for suspended-contract dashboards
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_index_trades_suspended
  ON index_trades (suspended_at DESC) WHERE status = 'suspended';

CREATE INDEX IF NOT EXISTS idx_trades_suspended
  ON trades (suspended_at DESC) WHERE status = 'suspended';

CREATE INDEX IF NOT EXISTS idx_spx_trades_suspended
  ON spx_trades (suspended_at DESC) WHERE state = 'suspended';
