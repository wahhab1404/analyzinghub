/*
  # Fix process_trade_new_entry: invalid trade_outcome_type enum values

  The function was setting trade_outcome = 'win' or 'loss', which are not valid
  enum values. The correct values are:
    big_win   — profit >= $500
    small_win — profit >= $100
    breakeven — profit in (-$100, $100)
    small_loss — profit < 0 (but > -$500)
    big_loss  — profit <= -$500

  This migration recreates process_trade_new_entry with the correct mapping.
*/

CREATE OR REPLACE FUNCTION process_trade_new_entry(
  p_existing_trade_id uuid,
  p_new_trade_data jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_trade record;
  v_new_trade_id uuid;
  v_final_pnl numeric;
  v_outcome text;            -- human-readable label for event log
  v_trade_outcome trade_outcome_type;
  v_result jsonb;
BEGIN
  -- Lock and get existing trade
  SELECT * INTO v_existing_trade
  FROM index_trades
  WHERE id = p_existing_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Existing trade not found');
  END IF;

  -- Check if already processed (idempotency)
  IF EXISTS (SELECT 1 FROM index_trades WHERE idempotency_key = p_idempotency_key) THEN
    SELECT id INTO v_new_trade_id FROM index_trades WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already processed',
      'new_trade_id', v_new_trade_id
    );
  END IF;

  -- Finalize existing trade using high watermark rules
  IF COALESCE(v_existing_trade.max_profit, 0) >= 100 THEN
    v_final_pnl := v_existing_trade.max_profit;
    v_outcome := 'win';
  ELSE
    v_final_pnl := -COALESCE(v_existing_trade.entry_cost_usd, 0);
    v_outcome := 'loss';
  END IF;

  -- Map to valid trade_outcome_type enum
  v_trade_outcome := CASE
    WHEN v_final_pnl >= 500 THEN 'big_win'::trade_outcome_type
    WHEN v_final_pnl >= 100 THEN 'small_win'::trade_outcome_type
    WHEN v_final_pnl <= -500 THEN 'big_loss'::trade_outcome_type
    WHEN v_final_pnl <    0 THEN 'small_loss'::trade_outcome_type
    ELSE 'breakeven'::trade_outcome_type
  END;

  -- Close existing trade
  UPDATE index_trades
  SET
    status          = 'closed',
    closure_reason  = 'REENTER_NEW_ENTRY',
    closed_at       = now(),
    pnl_usd         = v_final_pnl,
    final_profit    = v_final_pnl,
    outcome         = v_outcome,
    is_win          = (v_outcome = 'win'),
    trade_outcome   = v_trade_outcome,
    updated_at      = now()
  WHERE id = p_existing_trade_id;

  -- Create event for closure
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    p_existing_trade_id,
    v_existing_trade.author_id,
    'REENTER_NEW_ENTRY_CLOSE',
    jsonb_build_object(
      'reason', 'REENTER_NEW_ENTRY',
      'final_pnl', v_final_pnl,
      'outcome', v_outcome,
      'trade_outcome', v_trade_outcome::text,
      'max_profit', v_existing_trade.max_profit,
      'max_contract_price', v_existing_trade.max_contract_price,
      'entry_cost', v_existing_trade.entry_cost_usd
    )
  );

  -- Create new trade
  INSERT INTO index_trades (
    author_id,
    analysis_id,
    status,
    instrument_type,
    direction,
    underlying_index_symbol,
    polygon_underlying_index_ticker,
    polygon_option_ticker,
    strike,
    expiry,
    option_type,
    contract_multiplier,
    entry_underlying_snapshot,
    entry_contract_snapshot,
    current_contract,
    qty,
    entry_cost_usd,
    max_profit,
    max_contract_price,
    original_entry_price,
    trade_price_basis,
    telegram_channel_id,
    telegram_send_enabled,
    idempotency_key,
    created_at,
    published_at
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

  -- Create event for new trade
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    v_new_trade_id,
    (p_new_trade_data->>'author_id')::uuid,
    'REENTER_NEW_ENTRY_CREATE',
    jsonb_build_object(
      'previous_trade_id', p_existing_trade_id,
      'previous_outcome', v_outcome,
      'previous_pnl', v_final_pnl,
      'new_entry_price', (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
      'new_qty', COALESCE((p_new_trade_data->>'qty')::integer, 1)
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'action', 'NEW_ENTRY',
    'closed_trade_id', p_existing_trade_id,
    'closed_trade_pnl', v_final_pnl,
    'closed_trade_outcome', v_outcome,
    'new_trade_id', v_new_trade_id
  );

  RETURN v_result;
END;
$$;

-- Re-grant permissions (CREATE OR REPLACE drops them)
GRANT EXECUTE ON FUNCTION process_trade_new_entry TO authenticated, service_role;
