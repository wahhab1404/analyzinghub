/*
  # Make the live peak watermark update INSTANTLY for genuine streaming ticks.

  ## Problem
  20260623130000 added a 60-second "settling window" after a trade is published
  during which the high/low watermark cannot move at all:

      v_watermark_eligible := (p_event_ts >= v_published_at)
                          AND (now() >= v_published_at + 60s);

  That blanket 60s blackout means a freshly-entered ("last") contract's peak
  does NOT update for a full minute — peaks feel laggy / not real-time, worst
  on the newest trade.

  ## Why the blackout existed (and why streaming doesn't need it)
  The #156 false-peak came from a STALE price right at entry. The live WS feed
  (polygon-options-ws.ts) stamps each tick with Polygon's REAL event timestamp
  (latestTimestampNs), so a stale pre-entry quote carries an OLD timestamp and
  is already rejected by `p_event_ts >= v_published_at`. The only path that
  stamps now() on a possibly-stale quote is the REST snapshot fallback
  (p_premium_source = 'snapshot'); that is the path the settling window must
  guard.

  ## Fix
  Apply the settling window ONLY to snapshot/REST ticks. Genuine live-stream
  ticks (any source other than 'snapshot') move the watermark immediately,
  gated solely by the timestamp check — so peaks update in real time while the
  stale-at-entry guard still protects the REST fallback. Everything else in the
  function is byte-for-byte unchanged.
*/

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
  v_settle_seconds        CONSTANT INTEGER := 60; -- settling window (snapshot/REST only)
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
  -- The watermark may only move for genuine post-publish ticks. Live-stream
  -- ticks carry Polygon's real event timestamp, so the timestamp check alone
  -- protects them — they update the peak INSTANTLY. Only snapshot/REST ticks
  -- (stamped now()) must also wait out the short settling window, since a stale
  -- quote at entry could otherwise be mistaken for a fresh peak.
  v_published_at := COALESCE(v_trade.published_at, v_trade.created_at, now());
  v_watermark_eligible :=
        (p_event_ts >= v_published_at)
    AND (
          p_premium_source IS DISTINCT FROM 'snapshot'
          OR now() >= v_published_at + make_interval(secs => v_settle_seconds)
        );

  -- ── 3. RESOLVE MULTIPLIER & QTY ────────────────────────────────────────────
  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty        := COALESCE(v_trade.qty, 1);

  -- ── 4. COMPUTE HIGH WATERMARK ──────────────────────────────────────────────
  v_old_high := COALESCE(
    GREATEST(v_trade.max_contract_price, v_trade.contract_high_since),
    v_trade.max_contract_price,
    v_trade.contract_high_since,
    v_entry_price
  );

  IF p_current_price > v_old_high AND v_watermark_eligible THEN
    v_new_high        := p_current_price;
    v_is_new_high     := true;
    v_previous_was_manual := COALESCE(v_trade.manually_edited_high, false);
  ELSE
    v_new_high := v_old_high;
  END IF;

  -- ── 5. COMPUTE LOW WATERMARK ───────────────────────────────────────────────
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
  v_max_profit_dollars := v_mfe;
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
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,
      max_contract_price        = v_new_high,
      contract_high_since       = v_new_high,
      highest_premium_at        = CASE WHEN v_is_new_high THEN p_event_ts
                                       ELSE highest_premium_at END,
      manually_edited_high      = CASE WHEN v_is_new_high AND v_previous_was_manual
                                       THEN false ELSE manually_edited_high END,
      high_source               = CASE WHEN v_is_new_high THEN 'auto'
                                       ELSE high_source END,
      contract_low_since        = v_new_low,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN p_event_ts
                                       ELSE lowest_premium_at END,
      mfe                       = v_mfe,
      mae                       = v_mae,
      max_profit                = v_max_profit_dollars,
      profit_from_entry         = v_profit_from_entry,
      is_winning_trade          = true,
      is_win                    = true,
      win_at                    = now(),
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = p_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;

  ELSIF v_is_new_high OR v_is_new_low THEN
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,
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
      contract_low_since        = CASE WHEN v_is_new_low THEN v_new_low
                                       ELSE contract_low_since END,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN p_event_ts
                                       ELSE lowest_premium_at END,
      mfe                       = v_mfe,
      mae                       = v_mae,
      max_profit                = GREATEST(COALESCE(max_profit, 0), v_max_profit_dollars),
      profit_from_entry         = v_profit_from_entry,
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = p_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;

  ELSE
    UPDATE index_trades
    SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = p_event_ts,
      profit_from_entry         = v_profit_from_entry,
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
