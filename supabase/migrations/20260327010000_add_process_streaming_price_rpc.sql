-- ============================================================================
-- Phase 1: process_streaming_price_update() RPC
--
-- This function is the single entry point for all streaming price events.
-- It is called by the realtime-pricing-service on every Polygon quote/trade
-- event, replacing the old once-per-minute poll+compare approach.
--
-- WHAT IT DOES (atomically, inside a single DB transaction):
--   1. Reads current trade state (entry price, existing high/low, win status)
--   2. Updates current_contract, current_contract_snapshot, last_quote_at
--   3. Updates contract_high_since + max_contract_price if price is a new high
--      → sets highest_premium_at to now()
--   4. Updates contract_low_since if price is a new low
--      → sets lowest_premium_at to now()
--   5. Recalculates MFE and MAE in USD
--   6. Sets premium_source and data_freshness_status = 'fresh'
--   7. Sets last_stream_event_at = now()
--   8. Evaluates win condition (max_profit >= $100 threshold)
--      → sets is_winning_trade, win_at on first win
--   9. Evaluates profit_from_entry (current vs entry)
--  10. Returns a rich JSONB payload for the caller to use for alert decisions
--
-- RETURN PAYLOAD:
--   {
--     "success":                 true,
--     "is_new_high":             boolean,
--     "is_new_low":              boolean,
--     "newly_won":               boolean,
--     "new_high":                numeric,
--     "new_low":                 numeric,
--     "mfe":                     numeric,
--     "mae":                     numeric,
--     "max_profit_dollars":      numeric,
--     "profit_from_entry":       numeric,
--     "is_win":                  boolean,
--     "previous_was_manual_high": boolean
--   }
--
-- DESIGN NOTES:
--   - Uses SECURITY DEFINER so the realtime service (service_role JWT) can
--     update any active trade regardless of RLS author checks.
--   - Idempotent for prices equal to the stored high (no spurious updates).
--   - Preserves manually-set highs: a manual high is only overwritten when
--     the live price strictly exceeds it (same rule as update_trade_high_watermark).
--   - contract_low_since is initialised to entry_price if NULL (first tick).
-- ============================================================================

CREATE OR REPLACE FUNCTION process_streaming_price_update(
  p_trade_id        UUID,
  p_current_price   NUMERIC,
  p_premium_source  TEXT    DEFAULT 'smart_hybrid',
  p_bid             NUMERIC DEFAULT NULL,
  p_ask             NUMERIC DEFAULT NULL,
  p_last_trade      NUMERIC DEFAULT NULL,
  p_volume          NUMERIC DEFAULT NULL,
  p_event_ts        TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade                 RECORD;
  v_entry_price           NUMERIC;
  v_old_high              NUMERIC;
  v_new_high              NUMERIC;
  v_old_low               NUMERIC;
  v_new_low               NUMERIC;
  v_multiplier            INTEGER;
  v_qty                   INTEGER;
  v_is_new_high           BOOLEAN := false;
  v_is_new_low            BOOLEAN := false;
  v_is_win                BOOLEAN;
  v_was_already_win       BOOLEAN;
  v_newly_won             BOOLEAN := false;
  v_previous_was_manual   BOOLEAN := false;
  v_mfe                   NUMERIC;
  v_mae                   NUMERIC;
  v_max_profit_dollars    NUMERIC;
  v_profit_from_entry     NUMERIC;
  v_snapshot              JSONB;
BEGIN
  -- ── 1. LOAD TRADE ──────────────────────────────────────────────────────────
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Trade not found or not active'
    );
  END IF;

  -- Skip if trade is using a manual price override (don't clobber it).
  IF COALESCE(v_trade.is_using_manual_price, false) THEN
    RETURN jsonb_build_object(
      'success',        false,
      'skipped',        true,
      'reason',         'manual_price_override_active'
    );
  END IF;

  -- ── 2. RESOLVE ENTRY PRICE ─────────────────────────────────────────────────
  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'price')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'last')::NUMERIC,
    p_current_price  -- last-resort: use the live price itself (prevents NULL math)
  );

  -- ── 3. RESOLVE MULTIPLIER & QTY ────────────────────────────────────────────
  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty        := COALESCE(v_trade.qty, 1);

  -- ── 4. COMPUTE HIGH WATERMARK ──────────────────────────────────────────────
  -- Take the greater of both canonical high columns to be safe across the
  -- sync gap that existed before the fix migration.
  v_old_high := COALESCE(
    GREATEST(v_trade.max_contract_price, v_trade.contract_high_since),
    v_trade.max_contract_price,
    v_trade.contract_high_since,
    v_entry_price
  );

  IF p_current_price > v_old_high THEN
    v_new_high        := p_current_price;
    v_is_new_high     := true;
    -- Track when a live price overtakes a manually-set high.
    v_previous_was_manual := COALESCE(v_trade.manually_edited_high, false);
  ELSE
    v_new_high := v_old_high;
  END IF;

  -- ── 5. COMPUTE LOW WATERMARK ───────────────────────────────────────────────
  -- Initialise contract_low_since to entry_price on first streaming tick if NULL.
  v_old_low := COALESCE(v_trade.contract_low_since, v_entry_price);

  IF p_current_price < v_old_low THEN
    v_new_low    := p_current_price;
    v_is_new_low := true;
  ELSE
    v_new_low := v_old_low;
  END IF;

  -- ── 6. COMPUTE MFE / MAE ───────────────────────────────────────────────────
  v_mfe := GREATEST(0, (v_new_high - v_entry_price) * v_qty * v_multiplier);
  v_mae := GREATEST(0, (v_entry_price - v_new_low)  * v_qty * v_multiplier);

  -- ── 7. WIN CONDITION ───────────────────────────────────────────────────────
  v_max_profit_dollars := v_mfe; -- MFE == max_profit in dollar terms
  v_is_win             := v_max_profit_dollars >= 100;
  v_was_already_win    := COALESCE(v_trade.is_winning_trade, false);
  v_newly_won          := v_is_win AND NOT v_was_already_win;

  -- ── 8. CURRENT P/L FROM ENTRY ──────────────────────────────────────────────
  v_profit_from_entry := (p_current_price - v_entry_price) * v_qty * v_multiplier;

  -- ── 9. BUILD SNAPSHOT JSON ─────────────────────────────────────────────────
  v_snapshot := jsonb_build_object(
    'bid',       p_bid,
    'ask',       p_ask,
    'mid',       CASE WHEN p_bid IS NOT NULL AND p_ask IS NOT NULL
                      THEN ROUND((p_bid + p_ask) / 2, 4)
                      ELSE NULL END,
    'last',      p_last_trade,
    'volume',    p_volume,
    'timestamp', p_event_ts
  );

  -- ── 10. WRITE TO DB ────────────────────────────────────────────────────────
  IF v_newly_won THEN
    -- Win milestone: update high + win fields in one shot.
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,

      -- High watermark
      max_contract_price        = v_new_high,
      contract_high_since       = v_new_high,
      highest_premium_at        = CASE WHEN v_is_new_high THEN p_event_ts
                                       ELSE highest_premium_at END,
      manually_edited_high      = CASE WHEN v_is_new_high AND v_previous_was_manual
                                       THEN false ELSE manually_edited_high END,
      high_source               = CASE WHEN v_is_new_high THEN 'auto'
                                       ELSE high_source END,

      -- Low watermark
      contract_low_since        = v_new_low,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN p_event_ts
                                       ELSE lowest_premium_at END,

      -- MFE / MAE
      mfe                       = v_mfe,
      mae                       = v_mae,

      -- P/L
      max_profit                = v_max_profit_dollars,
      profit_from_entry         = v_profit_from_entry,

      -- Win milestone
      is_winning_trade          = true,
      is_win                    = true,
      win_at                    = now(),

      -- Streaming metadata
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = p_event_ts,

      updated_at                = now()
    WHERE id = p_trade_id;

  ELSIF v_is_new_high OR v_is_new_low THEN
    -- New high and/or new low, but not yet a win.
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,

      -- High watermark (only update if it's actually a new high)
      max_contract_price        = CASE WHEN v_is_new_high THEN v_new_high
                                       ELSE max_contract_price END,
      contract_high_since       = CASE WHEN v_is_new_high THEN v_new_high
                                       ELSE contract_high_since END,
      highest_premium_at        = CASE WHEN v_is_new_high THEN p_event_ts
                                       ELSE highest_premium_at END,
      manually_edited_high      = CASE WHEN v_is_new_high AND v_previous_was_manual
                                       THEN false ELSE manually_edited_high END,
      high_source               = CASE WHEN v_is_new_high THEN 'auto'
                                       ELSE high_source END,

      -- Low watermark (only update if it's actually a new low)
      contract_low_since        = CASE WHEN v_is_new_low THEN v_new_low
                                       ELSE contract_low_since END,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN p_event_ts
                                       ELSE lowest_premium_at END,

      -- MFE / MAE
      mfe                       = v_mfe,
      mae                       = v_mae,

      -- P/L
      max_profit                = GREATEST(COALESCE(max_profit, 0), v_max_profit_dollars),
      profit_from_entry         = v_profit_from_entry,

      -- Streaming metadata
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = p_event_ts,

      updated_at                = now()
    WHERE id = p_trade_id;

  ELSE
    -- Price did not set a new high or low — only update current price + metadata.
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,
      profit_from_entry         = v_profit_from_entry,
      -- MFE/MAE don't change when no new extreme, but keep them fresh.
      mfe                       = COALESCE(mfe, v_mfe),
      mae                       = COALESCE(mae, v_mae),
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = p_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;
  END IF;

  -- ── 11. RETURN RESULT ──────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',                  true,
    'is_new_high',              v_is_new_high,
    'is_new_low',               v_is_new_low,
    'newly_won',                v_newly_won,
    'new_high',                 v_new_high,
    'new_low',                  v_new_low,
    'mfe',                      v_mfe,
    'mae',                      v_mae,
    'max_profit_dollars',       v_max_profit_dollars,
    'profit_from_entry',        v_profit_from_entry,
    'is_win',                   v_is_win,
    'previous_was_manual_high', v_previous_was_manual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_streaming_price_update TO authenticated, service_role;

-- ============================================================================
-- update_streaming_freshness() — batch health-check updater
--
-- Called periodically (e.g., every 60 s) by the edge function or a cron job
-- to mark trades as 'degraded' or 'stale' based on how long ago their last
-- streaming event was received.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_streaming_freshness(
  p_degraded_after_seconds  INTEGER DEFAULT 60,
  p_stale_after_seconds     INTEGER DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_degraded_count  INTEGER;
  v_stale_count     INTEGER;
  v_cutoff_degraded TIMESTAMPTZ;
  v_cutoff_stale    TIMESTAMPTZ;
BEGIN
  v_cutoff_degraded := now() - (p_degraded_after_seconds || ' seconds')::INTERVAL;
  v_cutoff_stale    := now() - (p_stale_after_seconds    || ' seconds')::INTERVAL;

  -- Mark as stale (no event for >p_stale_after_seconds)
  UPDATE index_trades
  SET
    data_freshness_status = 'stale',
    updated_at            = now()
  WHERE status = 'active'
    AND last_stream_event_at < v_cutoff_stale
    AND data_freshness_status <> 'stale';

  GET DIAGNOSTICS v_stale_count = ROW_COUNT;

  -- Mark as degraded (no event for >p_degraded_after_seconds but not yet stale)
  UPDATE index_trades
  SET
    data_freshness_status = 'degraded',
    updated_at            = now()
  WHERE status = 'active'
    AND last_stream_event_at >= v_cutoff_stale
    AND last_stream_event_at  < v_cutoff_degraded
    AND data_freshness_status <> 'degraded';

  GET DIAGNOSTICS v_degraded_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',        true,
    'stale_updated',  v_stale_count,
    'degraded_updated', v_degraded_count,
    'cutoff_degraded', v_cutoff_degraded,
    'cutoff_stale',    v_cutoff_stale
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_streaming_freshness TO service_role;
