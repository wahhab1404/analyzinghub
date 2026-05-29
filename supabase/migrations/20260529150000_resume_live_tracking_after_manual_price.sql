-- ============================================================================
-- Resume live tracking after a manual price override
--
-- PROBLEM
--   Once index_trades.is_using_manual_price was set to true — by a manual
--   current-price entry (markets-closed create) or by the ManualHighUpdateDialog
--   → /manual-price route — BOTH the streaming RPC (process_streaming_price_update)
--   and the indices-trade-tracker edge function skipped the trade unconditionally,
--   and nothing ever cleared the flag. So the contract price FROZE permanently:
--   the platform card stopped updating the live premium even after the market
--   reopened and real quotes were flowing again. Analysts reported "after I
--   edited the contract peak, the contract value became static".
--
-- FIX
--   Treat is_using_manual_price as a TEMPORARY placeholder that only holds while
--   no live data exists (e.g. market closed → no streaming ticks, edge function
--   already skips on market-closed). The moment a genuine live price update
--   arrives, the RPC now RESUMES auto-tracking: it clears is_using_manual_price
--   (and the stale manual_contract_price) and processes the tick normally.
--
--   The manually-set HIGH is preserved: contract_high_since / max_contract_price
--   are never lowered — a live price below the manual peak keeps the peak and
--   simply updates current_contract, which is exactly the desired behaviour
--   ("keep my peak, let the live price keep moving").
--
--   Based on the deployed definition (includes the v_event_ts sanity guard).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_streaming_price_update(
  p_trade_id        UUID,
  p_current_price   NUMERIC,
  p_premium_source  TEXT    DEFAULT 'smart_hybrid',
  p_bid             NUMERIC DEFAULT NULL,
  p_ask             NUMERIC DEFAULT NULL,
  p_last_trade      NUMERIC DEFAULT NULL,
  p_volume          NUMERIC DEFAULT NULL,
  p_event_ts        TIMESTAMPTZ DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_resumed_from_manual   BOOLEAN := false;
  v_mfe                   NUMERIC;
  v_mae                   NUMERIC;
  v_max_profit_dollars    NUMERIC;
  v_profit_from_entry     NUMERIC;
  v_snapshot              JSONB;
  v_event_ts              TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trade not found or not active');
  END IF;

  -- A manual price override is only a placeholder for when no live data exists
  -- (market closed). A genuine live tick supersedes it: resume auto-tracking by
  -- clearing the flag (done in the UPDATEs below) instead of skipping forever.
  -- The manually-set HIGH is preserved because the high watermark is never
  -- lowered below the stored value.
  v_resumed_from_manual := COALESCE(v_trade.is_using_manual_price, false);

  -- Guard against malformed timestamps (e.g. a units mismatch that yields a
  -- 1970 value). An implausible event time must not poison last_stream_event_at,
  -- otherwise the freshness logic marks the trade "stale" and forces the edge
  -- tracker into a needless REST fallback even while the live stream is healthy.
  v_event_ts := CASE
    WHEN p_event_ts IS NULL
      OR p_event_ts < (now() - INTERVAL '1 day')
      OR p_event_ts > (now() + INTERVAL '1 hour')
    THEN now()
    ELSE p_event_ts
  END;

  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'price')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'last')::NUMERIC,
    p_current_price
  );

  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty        := COALESCE(v_trade.qty, 1);

  v_old_high := COALESCE(
    GREATEST(v_trade.max_contract_price, v_trade.contract_high_since),
    v_trade.max_contract_price,
    v_trade.contract_high_since,
    v_entry_price
  );

  IF p_current_price > v_old_high THEN
    v_new_high            := p_current_price;
    v_is_new_high         := true;
    v_previous_was_manual := COALESCE(v_trade.manually_edited_high, false);
  ELSE
    v_new_high := v_old_high;
  END IF;

  v_old_low := COALESCE(v_trade.contract_low_since, v_entry_price);

  IF p_current_price < v_old_low THEN
    v_new_low    := p_current_price;
    v_is_new_low := true;
  ELSE
    v_new_low := v_old_low;
  END IF;

  v_mfe := GREATEST(0, (v_new_high - v_entry_price) * v_qty * v_multiplier);
  v_mae := GREATEST(0, (v_entry_price - v_new_low)  * v_qty * v_multiplier);

  v_max_profit_dollars := v_mfe;
  v_is_win             := v_max_profit_dollars >= 100;
  v_was_already_win    := COALESCE(v_trade.is_winning_trade, false);
  v_newly_won          := v_is_win AND NOT v_was_already_win;

  v_profit_from_entry := (p_current_price - v_entry_price) * v_qty * v_multiplier;

  v_snapshot := jsonb_build_object(
    'bid',       p_bid,
    'ask',       p_ask,
    'mid',       CASE WHEN p_bid IS NOT NULL AND p_ask IS NOT NULL
                      THEN ROUND((p_bid + p_ask) / 2, 4)
                      ELSE NULL END,
    'last',      p_last_trade,
    'volume',    p_volume,
    'timestamp', v_event_ts
  );

  IF v_newly_won THEN
    UPDATE index_trades SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = v_event_ts,
      is_using_manual_price     = false,
      manual_contract_price     = NULL,
      max_contract_price        = v_new_high,
      contract_high_since       = v_new_high,
      highest_premium_at        = CASE WHEN v_is_new_high THEN v_event_ts ELSE highest_premium_at END,
      manually_edited_high      = CASE WHEN v_is_new_high AND v_previous_was_manual THEN false ELSE manually_edited_high END,
      high_source               = CASE WHEN v_is_new_high THEN 'auto' ELSE high_source END,
      contract_low_since        = v_new_low,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN v_event_ts ELSE lowest_premium_at END,
      mfe                       = v_mfe,
      mae                       = v_mae,
      max_profit                = v_max_profit_dollars,
      profit_from_entry         = v_profit_from_entry,
      is_winning_trade          = true,
      is_win                    = true,
      win_at                    = now(),
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = v_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;

  ELSIF v_is_new_high OR v_is_new_low THEN
    UPDATE index_trades SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = v_event_ts,
      is_using_manual_price     = false,
      manual_contract_price     = NULL,
      max_contract_price        = CASE WHEN v_is_new_high THEN v_new_high ELSE max_contract_price END,
      contract_high_since       = CASE WHEN v_is_new_high THEN v_new_high ELSE contract_high_since END,
      highest_premium_at        = CASE WHEN v_is_new_high THEN v_event_ts ELSE highest_premium_at END,
      manually_edited_high      = CASE WHEN v_is_new_high AND v_previous_was_manual THEN false ELSE manually_edited_high END,
      high_source               = CASE WHEN v_is_new_high THEN 'auto' ELSE high_source END,
      contract_low_since        = CASE WHEN v_is_new_low THEN v_new_low ELSE contract_low_since END,
      lowest_premium_at         = CASE WHEN v_is_new_low THEN v_event_ts ELSE lowest_premium_at END,
      mfe                       = v_mfe,
      mae                       = v_mae,
      max_profit                = GREATEST(COALESCE(max_profit, 0), v_max_profit_dollars),
      profit_from_entry         = v_profit_from_entry,
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = v_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;

  ELSE
    UPDATE index_trades SET
      current_contract          = p_current_price,
      current_contract_snapshot = v_snapshot,
      last_quote_at             = v_event_ts,
      is_using_manual_price     = false,
      manual_contract_price     = NULL,
      profit_from_entry         = v_profit_from_entry,
      mfe                       = COALESCE(mfe, v_mfe),
      mae                       = COALESCE(mae, v_mae),
      premium_source            = p_premium_source,
      data_freshness_status     = 'fresh',
      last_stream_event_at      = v_event_ts,
      updated_at                = now()
    WHERE id = p_trade_id;
  END IF;

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
    'resumed_from_manual',      v_resumed_from_manual
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION process_streaming_price_update TO authenticated, service_role;
