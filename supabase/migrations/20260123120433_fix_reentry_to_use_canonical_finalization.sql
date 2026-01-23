/*
  # Fix Re-Entry Functions to Use Canonical Finalization

  Updates the process_trade_new_entry function to use the canonical
  finalize_trade_canonical function instead of custom finalization logic.
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
  v_finalization_result jsonb;
  v_telegram_channel_id text;
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

  -- Use canonical finalization for the existing trade
  SELECT finalize_trade_canonical(p_existing_trade_id) INTO v_finalization_result;

  -- Close existing trade
  UPDATE index_trades
  SET 
    status = 'closed',
    closure_reason = 'REENTER_NEW_ENTRY',
    closed_at = now(),
    updated_at = now()
  WHERE id = p_existing_trade_id;

  -- Create event for closure
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    p_existing_trade_id,
    v_existing_trade.author_id,
    'REENTER_NEW_ENTRY_CLOSE',
    jsonb_build_object(
      'reason', 'REENTER_NEW_ENTRY',
      'finalization', v_finalization_result
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
  ) RETURNING id, telegram_channel_id INTO v_new_trade_id, v_telegram_channel_id;

  -- Create event for new trade
  INSERT INTO index_trade_events (trade_id, author_id, event_type, event_data)
  VALUES (
    v_new_trade_id,
    (p_new_trade_data->>'author_id')::uuid,
    'REENTER_NEW_ENTRY_CREATE',
    jsonb_build_object(
      'previous_trade_id', p_existing_trade_id,
      'previous_finalization', v_finalization_result,
      'new_entry_price', (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
      'new_qty', COALESCE((p_new_trade_data->>'qty')::integer, 1)
    )
  );

  -- Enqueue Telegram notification if channel is configured
  IF v_telegram_channel_id IS NOT NULL AND COALESCE((p_new_trade_data->>'telegram_send_enabled')::boolean, true) THEN
    BEGIN
      -- Get actual channel_id from telegram_channels table
      DECLARE
        v_actual_channel_id text;
      BEGIN
        SELECT channel_id INTO v_actual_channel_id
        FROM telegram_channels
        WHERE id = v_telegram_channel_id::uuid;

        IF v_actual_channel_id IS NOT NULL THEN
          INSERT INTO telegram_outbox (
            message_type,
            payload,
            channel_id,
            status,
            priority,
            next_retry_at
          ) VALUES (
            'reentry_new_entry',
            jsonb_build_object(
              'previous_trade_id', p_existing_trade_id,
              'finalization', v_finalization_result,
              'new_trade_id', v_new_trade_id,
              'new_entry_price', (p_new_trade_data->'entry_contract_snapshot'->>'mid')::numeric,
              'new_qty', COALESCE((p_new_trade_data->>'qty')::integer, 1),
              'symbol', p_new_trade_data->>'underlying_index_symbol',
              'option_ticker', p_new_trade_data->>'polygon_option_ticker'
            ),
            v_actual_channel_id,
            'pending',
            5,
            now()
          );
        END IF;
      END;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to enqueue Telegram notification: %', SQLERRM;
    END;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'action', 'NEW_ENTRY',
    'closed_trade_id', p_existing_trade_id,
    'finalization_result', v_finalization_result,
    'new_trade_id', v_new_trade_id
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION process_trade_new_entry TO authenticated, service_role;
