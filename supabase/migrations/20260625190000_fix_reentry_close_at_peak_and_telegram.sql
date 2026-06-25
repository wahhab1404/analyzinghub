/*
  # Fix re-entry (NEW_ENTRY): close the previous trade AT ITS HIGHEST PEAK.

  ## Problem found in process_trade_new_entry (from 20260528190000)
  CLOSE-AT-PEAK: it decided win/loss and P&L from the *stored* max_profit
  column. That column can be stale or 0 (e.g. a leg that never received a
  streaming tick, or whose max_profit was not maintained), so a leg that
  actually peaked well above entry could be closed as a LOSS — it did NOT
  reliably "close at the highest peak". finalize_trade_canonical already
  recomputes from the canonical peak columns; this function did not.

  ## Fix
  - Recompute high watermark = GREATEST(max_contract_price, peak_price_after_entry,
    contract_high_since, entry) and max profit = (hw - entry) * qty * mult, exactly
    like finalize_trade_canonical, then close the previous leg on that basis.
  - Persist the peak (max_profit, max_contract_price) and mark counted_in_stats.

  ## NOT changed (by request)
  - The previous leg closes SILENTLY — no Telegram closure alert.
  - Only the NEW leg is announced, as a normal "new_trade" entry, by the API
    caller (publishNewTradeToTelegram) — same as any first entry.
*/

CREATE OR REPLACE FUNCTION public.process_trade_new_entry(
  p_existing_trade_id uuid,
  p_new_trade_data jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_trade   record;
  v_new_trade_id     uuid;
  v_entry_price      numeric;
  v_high_watermark   numeric;
  v_multiplier       integer;
  v_qty              integer;
  v_total_cost       numeric;
  v_max_profit       numeric;
  v_final_pnl        numeric;
  v_outcome          text;          -- 'succeed' | 'loss'
  v_trade_outcome    trade_outcome_type;
  v_result           jsonb;
BEGIN
  -- Lock and load the existing trade
  SELECT * INTO v_existing_trade
  FROM index_trades
  WHERE id = p_existing_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Existing trade not found');
  END IF;

  -- Idempotency: if this key already created a trade, return it
  IF EXISTS (SELECT 1 FROM index_trades WHERE idempotency_key = p_idempotency_key) THEN
    SELECT id INTO v_new_trade_id FROM index_trades WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already processed',
      'new_trade_id', v_new_trade_id
    );
  END IF;

  -- ── CLOSE PREVIOUS TRADE AT ITS HIGHEST PEAK ───────────────────────────────
  v_entry_price := COALESCE(
    (v_existing_trade.entry_contract_snapshot->>'mid')::numeric,
    (v_existing_trade.entry_contract_snapshot->>'price')::numeric,
    (v_existing_trade.entry_contract_snapshot->>'last')::numeric,
    0
  );

  -- Highest peak the leg reached (canonical columns), never below entry.
  v_high_watermark := COALESCE(
    GREATEST(
      v_existing_trade.max_contract_price,
      v_existing_trade.peak_price_after_entry,
      v_existing_trade.contract_high_since
    ),
    v_existing_trade.max_contract_price,
    v_existing_trade.contract_high_since,
    v_entry_price
  );

  v_multiplier := COALESCE(v_existing_trade.contract_multiplier, 100);
  v_qty        := COALESCE(v_existing_trade.qty, 1);
  v_total_cost := COALESCE(v_existing_trade.entry_cost_usd, v_entry_price * v_qty * v_multiplier);
  v_max_profit := GREATEST(0, (v_high_watermark - v_entry_price) * v_qty * v_multiplier);

  -- High-watermark rule: a leg that peaked to >= $100 profit closes as a WIN at
  -- that peak; otherwise it closes as a full-cost LOSS.
  IF v_max_profit >= 100 THEN
    v_final_pnl := v_max_profit;
    v_outcome   := 'succeed';
  ELSE
    v_final_pnl := -v_total_cost;
    v_outcome   := 'loss';
  END IF;

  v_trade_outcome := CASE
    WHEN v_final_pnl >= 500 THEN 'big_win'::trade_outcome_type
    WHEN v_final_pnl >= 100 THEN 'small_win'::trade_outcome_type
    WHEN v_final_pnl <= -500 THEN 'big_loss'::trade_outcome_type
    WHEN v_final_pnl <    0 THEN 'small_loss'::trade_outcome_type
    ELSE 'breakeven'::trade_outcome_type
  END;

  UPDATE index_trades
  SET
    status             = 'closed',
    closure_reason     = 'REENTER_NEW_ENTRY',
    closed_at          = now(),
    pnl_usd            = v_final_pnl,
    final_profit       = v_final_pnl,
    outcome            = v_outcome,
    is_win             = (v_outcome = 'succeed'),
    is_winning_trade   = (v_outcome = 'succeed'),
    trade_outcome      = v_trade_outcome,
    max_profit         = GREATEST(COALESCE(max_profit, 0), v_max_profit),
    max_contract_price = v_high_watermark,
    counted_in_stats   = true,
    updated_at         = now()
  WHERE id = p_existing_trade_id;

  -- Audit: closure event
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    p_existing_trade_id,
    v_existing_trade.author_id,
    'REENTER_NEW_ENTRY_CLOSE',
    jsonb_build_object(
      'reason',             'REENTER_NEW_ENTRY',
      'final_pnl',          v_final_pnl,
      'outcome',            v_outcome,
      'trade_outcome',      v_trade_outcome::text,
      'high_watermark',     v_high_watermark,
      'max_profit',         v_max_profit,
      'max_contract_price', v_existing_trade.max_contract_price,
      'entry_cost',         v_existing_trade.entry_cost_usd
    )
  );

  -- NOTE: No Telegram alert is sent for the closure of the previous leg (by
  -- request). The previous leg is closed silently at its peak; only the NEW
  -- leg is announced — as a fresh "new_trade" entry — by the API caller
  -- (publishNewTradeToTelegram), exactly like any first entry.

  -- ── CREATE THE NEW LEG (second entry) ──────────────────────────────────────
  INSERT INTO index_trades (
    author_id, analysis_id, status, instrument_type, direction,
    underlying_index_symbol, polygon_underlying_index_ticker, polygon_option_ticker,
    strike, expiry, option_type, contract_multiplier,
    entry_underlying_snapshot, entry_contract_snapshot, current_contract,
    qty, entry_cost_usd, max_profit, max_contract_price, original_entry_price,
    trade_price_basis, telegram_channel_id, telegram_send_enabled,
    idempotency_key, created_at, published_at
  ) VALUES (
    (p_new_trade_data->>'author_id')::uuid,
    (p_new_trade_data->>'analysis_id')::uuid,
    COALESCE(p_new_trade_data->>'status', 'active'),
    p_new_trade_data->>'instrument_type',
    p_new_trade_data->>'direction',
    p_new_trade_data->>'underlying_index_symbol',
    p_new_trade_data->>'polygon_underlying_index_ticker',
    p_new_trade_data->>'polygon_option_ticker',
    (p_new_trade_data->>'strike')::numeric,
    (p_new_trade_data->>'expiry')::date,
    p_new_trade_data->>'option_type',
    COALESCE((p_new_trade_data->>'contract_multiplier')::integer, 100),
    p_new_trade_data->'entry_underlying_snapshot',
    p_new_trade_data->'entry_contract_snapshot',
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    COALESCE((p_new_trade_data->>'qty')::integer, 1),
    (p_new_trade_data->>'entry_cost_usd')::numeric,
    0,
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
    COALESCE(p_new_trade_data->>'trade_price_basis', 'OPTION_PREMIUM'),
    (p_new_trade_data->>'telegram_channel_id')::uuid,
    COALESCE((p_new_trade_data->>'telegram_send_enabled')::boolean, true),
    p_idempotency_key,
    now(),
    now()
  ) RETURNING id INTO v_new_trade_id;

  -- Audit: new-leg creation event
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    v_new_trade_id,
    (p_new_trade_data->>'author_id')::uuid,
    'REENTER_NEW_ENTRY_CREATE',
    jsonb_build_object(
      'previous_trade_id', p_existing_trade_id,
      'previous_outcome',  v_outcome,
      'previous_pnl',      v_final_pnl,
      'previous_peak',     v_high_watermark,
      'new_entry_price',   (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
      'new_qty',           COALESCE((p_new_trade_data->>'qty')::integer, 1)
    )
  );

  v_result := jsonb_build_object(
    'success',              true,
    'action',               'NEW_ENTRY',
    'closed_trade_id',      p_existing_trade_id,
    'closed_trade_pnl',     v_final_pnl,
    'closed_trade_outcome', v_outcome,
    'closed_trade_peak',    v_high_watermark,
    'new_trade_id',         v_new_trade_id
  );

  RETURN v_result;
END;
$function$;
