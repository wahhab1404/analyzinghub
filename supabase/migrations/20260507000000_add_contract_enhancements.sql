/*
  # Contract Enhancements: Entry Price + Buy Range Alert

  ## Changes to index_trades:
  - `entry_price`           — explicit entry price (overrides entry_contract_snapshot derivation)
  - `buy_range_min`         — lower bound of the buy range alert
  - `buy_range_max`         — upper bound of the buy range alert
  - `buy_range_status`      — pending | hit | expired | cancelled
  - `buy_range_hit_at`      — when the price entered the range
  - `buy_range_alert_sent`  — deduplication flag: true once the alert has been sent
  - `buy_range_expires_at`  — optional expiry for the alert
  - `buy_range_telegram_channel_id` — Telegram channel UUID to route the alert to
  - `last_price_update_at`  — last time the contract price was updated (for monitoring)

  All columns are nullable and added with IF NOT EXISTS guards so the migration
  is safe to run against a database that already has some of these columns.
*/

-- ─── entry_price: explicit analyst-overridden entry price ────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS entry_price numeric(18,6);

-- Backfill from entry_contract_snapshot for existing rows
UPDATE index_trades
SET entry_price = COALESCE(
  (entry_contract_snapshot->>'price')::numeric,
  (entry_contract_snapshot->>'mid')::numeric,
  (entry_contract_snapshot->>'last')::numeric
)
WHERE entry_price IS NULL
  AND entry_contract_snapshot IS NOT NULL;

-- ─── last_price_update_at: tracks when current_contract was last updated ─────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS last_price_update_at timestamptz;

-- ─── buy_range_status enum ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'buy_range_status_enum') THEN
    CREATE TYPE buy_range_status_enum AS ENUM ('pending', 'hit', 'expired', 'cancelled');
  END IF;
END $$;

-- ─── buy range alert columns ─────────────────────────────────────────────────
ALTER TABLE index_trades
  ADD COLUMN IF NOT EXISTS buy_range_min         numeric(18,6),
  ADD COLUMN IF NOT EXISTS buy_range_max         numeric(18,6),
  ADD COLUMN IF NOT EXISTS buy_range_status      buy_range_status_enum,
  ADD COLUMN IF NOT EXISTS buy_range_hit_at      timestamptz,
  ADD COLUMN IF NOT EXISTS buy_range_alert_sent  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buy_range_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS buy_range_telegram_channel_id uuid;

-- Index for fast lookup of pending buy range alerts
CREATE INDEX IF NOT EXISTS idx_index_trades_buy_range_pending
  ON index_trades (buy_range_status)
  WHERE buy_range_status = 'pending';

-- ─── RPC: set_buy_range_alert ────────────────────────────────────────────────
-- Sets or clears a buy range alert on an index_trade.
-- Verifies the caller is the trade owner or a SuperAdmin.

CREATE OR REPLACE FUNCTION set_buy_range_alert(
  p_trade_id               uuid,
  p_buy_range_min          numeric,
  p_buy_range_max          numeric,
  p_buy_range_expires_at   timestamptz DEFAULT NULL,
  p_buy_range_channel_id   uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id  uuid;
  v_caller_id  uuid := auth.uid();
  v_role_name  text;
BEGIN
  -- Fetch trade owner
  SELECT author_id INTO v_author_id
  FROM index_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  -- Auth check
  SELECT r.name INTO v_role_name
  FROM profiles p
  JOIN roles r ON r.id = p.role_id
  WHERE p.id = v_caller_id;

  IF v_author_id <> v_caller_id AND v_role_name <> 'SuperAdmin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  -- Validate range
  IF p_buy_range_min IS NULL OR p_buy_range_max IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'buy_range_min and buy_range_max are required');
  END IF;

  IF p_buy_range_min >= p_buy_range_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'buy_range_min must be less than buy_range_max');
  END IF;

  UPDATE index_trades
  SET
    buy_range_min                = p_buy_range_min,
    buy_range_max                = p_buy_range_max,
    buy_range_status             = 'pending',
    buy_range_hit_at             = NULL,
    buy_range_alert_sent         = false,
    buy_range_expires_at         = p_buy_range_expires_at,
    buy_range_telegram_channel_id = p_buy_range_channel_id
  WHERE id = p_trade_id;

  RETURN jsonb_build_object('ok', true, 'trade_id', p_trade_id);
END;
$$;

-- ─── RPC: cancel_buy_range_alert ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_buy_range_alert(p_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_caller_id uuid := auth.uid();
  v_role_name text;
BEGIN
  SELECT author_id INTO v_author_id
  FROM index_trades WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  SELECT r.name INTO v_role_name
  FROM profiles p
  JOIN roles r ON r.id = p.role_id
  WHERE p.id = v_caller_id;

  IF v_author_id <> v_caller_id AND v_role_name <> 'SuperAdmin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  UPDATE index_trades
  SET buy_range_status = 'cancelled'
  WHERE id = p_trade_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grant execute to authenticated users (SECURITY DEFINER enforces row-level auth)
GRANT EXECUTE ON FUNCTION set_buy_range_alert TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_buy_range_alert TO authenticated;
