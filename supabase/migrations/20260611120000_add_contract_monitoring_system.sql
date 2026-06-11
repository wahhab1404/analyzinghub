/*
  # Contract Monitoring & Preparation System  (مراقبة وتجهيز العقد)

  Adds a pre-trade "monitoring" lifecycle to index_trades. An analyst can
  PREPARE a contract to watch (e.g. CALL strike 7500, current price 6,
  suggested execution range 3.5–4) WITHOUT it counting as a real trade.

  Flow:
    1. status='monitoring', monitor_status='watching'
       → a "preparation" alert with full details is sent to Telegram.
    2. When the live contract price drops into the execution range
       [exec_range_min, exec_range_max] the monitor enters 'in_zone' and
       starts tracking the BEST (lowest) price seen.
    3. When the price rebounds off that low (>= best * (1 + rebound_pct/100)),
       leaves the range upward, or the monitor expires while in-zone, the
       contract is EXECUTED at the best price: it becomes a live status='active'
       trade and an "execution" alert is sent.
    4. If the price never enters the range before expiry the monitor is marked
       'expired' and is NEVER counted as a trade.

  Because monitoring rows use a dedicated status ('monitoring') that no
  stats/report query references, they are naturally excluded from analyzer
  stats, win-rate and daily reports until (and unless) they execute.

  All columns are nullable / IF NOT EXISTS guarded so this is safe to re-run.
*/

-- ── 1. Allow the new 'monitoring' status ─────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE index_trades DROP CONSTRAINT IF EXISTS valid_status;
  ALTER TABLE index_trades ADD CONSTRAINT valid_status
    CHECK (status IN (
      'draft', 'active', 'tp_hit', 'sl_hit',
      'closed', 'canceled', 'expired', 'suspended', 'monitoring'
    ));
END $$;

-- ── 2. Monitoring columns ────────────────────────────────────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS is_monitoring             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitor_status            text,
  ADD COLUMN IF NOT EXISTS exec_range_min            numeric(18,6),
  ADD COLUMN IF NOT EXISTS exec_range_max            numeric(18,6),
  ADD COLUMN IF NOT EXISTS monitor_best_price        numeric(18,6),
  ADD COLUMN IF NOT EXISTS monitor_best_at           timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_last_price        numeric(18,6),
  ADD COLUMN IF NOT EXISTS monitor_entered_zone_at   timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_telegram_channel_id uuid,
  ADD COLUMN IF NOT EXISTS monitor_prep_alert_sent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitor_executed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS monitor_rebound_pct       numeric NOT NULL DEFAULT 3;

-- monitor_status lifecycle: watching → in_zone → executed | expired | cancelled
DO $$
BEGIN
  ALTER TABLE index_trades DROP CONSTRAINT IF EXISTS valid_monitor_status;
  ALTER TABLE index_trades ADD CONSTRAINT valid_monitor_status
    CHECK (monitor_status IS NULL OR monitor_status IN (
      'watching', 'in_zone', 'executed', 'expired', 'cancelled'
    ));
END $$;

-- Allow 'monitor' as an entry_price_source (auto-executed monitoring contracts).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'entry_price_source'
  ) THEN
    ALTER TABLE index_trades DROP CONSTRAINT IF EXISTS valid_entry_source;
    ALTER TABLE index_trades ADD CONSTRAINT valid_entry_source
      CHECK (entry_price_source IN ('polygon', 'manual', 'monitor'));
  END IF;
END $$;

-- Fast lookup for the monitor cron (only the handful of live monitors).
CREATE INDEX IF NOT EXISTS idx_index_trades_monitoring
  ON index_trades (status)
  WHERE status = 'monitoring';

-- ── 3. RPC: execute_monitored_contract ───────────────────────────────────────
-- Atomically converts a 'monitoring' row into a live 'active' trade, filling at
-- the supplied best price. Called by the indices-contract-monitor edge function
-- (service role). Idempotent: a row that is no longer 'monitoring' is a no-op.
CREATE OR REPLACE FUNCTION execute_monitored_contract(
  p_trade_id            uuid,
  p_entry_price         numeric,
  p_underlying_price    numeric DEFAULT NULL,
  p_underlying_snapshot jsonb   DEFAULT NULL,
  p_contract_snapshot   jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade   index_trades%ROWTYPE;
  v_qty     numeric;
  v_now     timestamptz := now();
BEGIN
  SELECT * INTO v_trade FROM index_trades WHERE id = p_trade_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  -- Idempotency: only a still-monitoring contract can be executed.
  IF v_trade.status <> 'monitoring' THEN
    RETURN jsonb_build_object('ok', true, 'already_executed', true, 'trade_id', p_trade_id);
  END IF;

  IF p_entry_price IS NULL OR p_entry_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid execution price');
  END IF;

  v_qty := COALESCE(v_trade.qty, 1);

  UPDATE index_trades
  SET
    status                   = 'active',
    monitor_status           = 'executed',
    monitor_executed_at      = v_now,
    entry_price              = p_entry_price,
    original_entry_price     = COALESCE(original_entry_price, p_entry_price),
    entry_price_source       = 'monitor',
    entry_override_reason    = COALESCE(entry_override_reason,
                                        'Auto-executed from monitoring at best price'),
    entry_underlying_snapshot = COALESCE(p_underlying_snapshot, entry_underlying_snapshot),
    entry_contract_snapshot   = COALESCE(p_contract_snapshot, entry_contract_snapshot),
    current_underlying       = COALESCE(p_underlying_price, current_underlying),
    current_contract         = p_entry_price,
    underlying_high_since    = COALESCE(p_underlying_price, current_underlying),
    underlying_low_since     = COALESCE(p_underlying_price, current_underlying),
    contract_high_since      = p_entry_price,
    contract_low_since        = p_entry_price,
    max_contract_price       = p_entry_price,
    max_profit               = 0,
    entry_cost_usd           = p_entry_price * v_qty * 100,
    qty                      = v_qty,
    last_quote_at            = v_now,
    last_price_update_at     = v_now,
    published_at             = v_now,
    updated_at               = v_now
  WHERE id = p_trade_id;

  RETURN jsonb_build_object(
    'ok', true,
    'trade_id', p_trade_id,
    'entry_price', p_entry_price
  );
END;
$$;

-- ── 4. RPC: cancel_contract_monitoring ───────────────────────────────────────
-- Lets the owner (or a SuperAdmin) cancel a monitoring contract before it
-- executes. The row stays in status='monitoring' with monitor_status='cancelled'
-- so it is never counted as a trade.
CREATE OR REPLACE FUNCTION cancel_contract_monitoring(p_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_status    text;
  v_caller_id uuid := auth.uid();
  v_role_name text;
BEGIN
  SELECT author_id, status INTO v_author_id, v_status
  FROM index_trades WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  SELECT r.name INTO v_role_name
  FROM profiles p JOIN roles r ON r.id = p.role_id
  WHERE p.id = v_caller_id;

  IF v_author_id <> v_caller_id AND COALESCE(v_role_name, '') <> 'SuperAdmin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  IF v_status <> 'monitoring' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contract is not in monitoring state');
  END IF;

  UPDATE index_trades
  SET monitor_status = 'cancelled', updated_at = now()
  WHERE id = p_trade_id;

  RETURN jsonb_build_object('ok', true, 'trade_id', p_trade_id);
END;
$$;

GRANT EXECUTE ON FUNCTION execute_monitored_contract  TO service_role;
GRANT EXECUTE ON FUNCTION cancel_contract_monitoring  TO authenticated;

-- ── 5. Schedule the monitor cron (every minute) ──────────────────────────────
-- Mirrors the existing indices cron jobs: pg_net POST to the edge function with
-- the service role key. Safe to re-run (unschedule first if it exists).
DO $$
BEGIN
  PERFORM cron.unschedule('indices-contract-monitor');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule(
  'indices-contract-monitor',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/indices-contract-monitor'
      ),
      headers := jsonb_build_object(
        'Authorization', concat('Bearer ', current_setting('app.settings.supabase_service_role_key', true)),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

COMMENT ON FUNCTION execute_monitored_contract IS
  'Converts a monitoring index_trade into a live active trade at the best (lowest) execution price.';
COMMENT ON FUNCTION cancel_contract_monitoring IS
  'Owner/SuperAdmin cancels a monitoring index_trade before it executes (never counted as a trade).';
