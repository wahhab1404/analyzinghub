-- ============================================================================
-- Guard the live peak/trough watermark against stale pre-entry prices.
--
-- BUG: Right after a trade was published, the first price the live feed
-- returned was sometimes a STALE value from earlier in the day (e.g. a 5.20
-- quote on a contract that was actually 3.70 at entry). Because
-- process_streaming_price_update() raised contract_high_since for any price
-- greater than the stored high — with no reference to WHEN that price
-- occurred — that stale value was recorded as a brand-new peak and fired a
-- false "NEW HIGH" Telegram alert the moment the trade went live.
--
-- FIX: Only let a tick move the high/low watermark when it is genuinely a
-- post-publish, live tick:
--   (a) its event timestamp is not older than the trade's published_at, AND
--   (b) we are past a short settling window after publish (so the first
--       delayed snapshot the feed returns right at entry cannot create a peak).
-- The current price, P/L and freshness metadata still update every tick — only
-- the high/low *watermark* (and therefore the new-high / win alerts) is gated.
--
-- Everything else in the function is preserved exactly as before.
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
  -- Peak-guard locals
  v_published_at          TIMESTAMPTZ;
  v_watermark_eligible    BOOLEAN := true;
  v_settle_seconds        CONSTANT INTEGER := 60; -- settling window after publish
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

  -- ── 2b. PEAK GUARD ─────────────────────────────────────────────────────────
  -- The watermark may only move for genuine post-publish live ticks.
  v_published_at := COALESCE(v_trade.published_at, v_trade.created_at, now());
  v_watermark_eligible :=
        (p_event_ts >= v_published_at)                                  -- tick not older than the trade
    AND (now() >= v_published_at + make_interval(secs => v_settle_seconds)); -- past settling window

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

  IF p_current_price > v_old_high AND v_watermark_eligible THEN
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

  IF p_current_price < v_old_low AND v_watermark_eligible THEN
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
    'previous_was_manual_high', v_previous_was_manual,
    'watermark_eligible',       v_watermark_eligible
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_streaming_price_update TO authenticated, service_role;
