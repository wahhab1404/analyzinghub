-- ============================================================================
-- Update update_trade_high_watermark to track high_source
--
-- When the auto-tracker (or any caller) pushes a price that exceeds the
-- current stored high, the function now:
--   1. Updates max_contract_price AND contract_high_since (existing behaviour)
--   2. Sets high_source = 'auto'
--   3. Clears manually_edited_high = false (the live market has surpassed
--      the manual value, so it is no longer the authoritative reference)
--
-- When the incoming price does NOT beat the stored high the function does
-- nothing to those three fields — preserving a manual override intact.
--
-- The return payload now includes:
--   previous_was_manual_high BOOLEAN — true when the old high was manually
--     set and the new live price just surpassed it.  Callers can use this
--     to log/audit the transition.
-- ============================================================================

CREATE OR REPLACE FUNCTION update_trade_high_watermark(
  p_trade_id UUID,
  p_current_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade RECORD;
  v_entry_price NUMERIC;
  v_old_high NUMERIC;
  v_new_high NUMERIC;
  v_multiplier INTEGER;
  v_qty INTEGER;
  v_max_profit_dollars NUMERIC;
  v_is_new_high BOOLEAN := false;
  v_is_win BOOLEAN;
  v_was_already_win BOOLEAN;
  v_previous_was_manual BOOLEAN := false;
  v_result JSONB;
BEGIN
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found');
  END IF;

  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'price')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'last')::NUMERIC,
    0
  );

  -- Always take the greater of the two canonical high columns so stale
  -- values in one field never cause a spurious reset.
  v_old_high := COALESCE(
    GREATEST(v_trade.max_contract_price, v_trade.contract_high_since),
    v_trade.max_contract_price,
    v_trade.contract_high_since,
    v_entry_price
  );

  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty := COALESCE(v_trade.qty, 1);
  v_was_already_win := COALESCE(v_trade.is_winning_trade, false);

  IF p_current_price > v_old_high THEN
    v_new_high := p_current_price;
    v_is_new_high := true;
    -- Flag when the live price is taking over from a manually set high
    v_previous_was_manual := COALESCE(v_trade.manually_edited_high, false);
  ELSE
    -- Incoming price does not beat the stored high — do nothing to the high.
    v_new_high := v_old_high;
  END IF;

  v_max_profit_dollars := GREATEST(0, (v_new_high - v_entry_price) * v_qty * v_multiplier);
  v_is_win := v_max_profit_dollars >= 100;

  IF v_is_win AND NOT v_was_already_win THEN
    UPDATE index_trades
    SET
      max_contract_price    = v_new_high,
      contract_high_since   = v_new_high,
      max_profit            = v_max_profit_dollars,
      profit_from_entry     = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      is_winning_trade      = true,
      is_win                = true,
      win_at                = now(),
      -- Auto-tracking has now surpassed any manual value
      high_source           = CASE WHEN v_is_new_high THEN 'auto' ELSE COALESCE(v_trade.high_source, 'auto') END,
      manually_edited_high  = CASE WHEN v_is_new_high THEN false  ELSE COALESCE(v_trade.manually_edited_high, false) END,
      updated_at            = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',                true,
      'is_new_high',            v_is_new_high,
      'new_high',               v_new_high,
      'max_profit_dollars',     v_max_profit_dollars,
      'is_win',                 v_is_win,
      'newly_won',              true,
      'previous_was_manual_high', v_previous_was_manual
    );

  ELSIF v_is_new_high THEN
    UPDATE index_trades
    SET
      max_contract_price    = v_new_high,
      contract_high_since   = v_new_high,
      max_profit            = v_max_profit_dollars,
      profit_from_entry     = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      -- Live market surpassed stored high — ownership transfers back to 'auto'
      high_source           = 'auto',
      manually_edited_high  = false,
      updated_at            = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',                true,
      'is_new_high',            true,
      'new_high',               v_new_high,
      'max_profit_dollars',     v_max_profit_dollars,
      'is_win',                 v_is_win,
      'newly_won',              false,
      'previous_was_manual_high', v_previous_was_manual
    );

  ELSE
    -- Price did not beat stored high. Update only the running P&L; leave
    -- high watermark fields, high_source, and manually_edited_high intact.
    UPDATE index_trades
    SET
      profit_from_entry = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      updated_at        = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',            true,
      'is_new_high',        false,
      'new_high',           v_new_high,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win',             v_is_win,
      'newly_won',          false,
      'previous_was_manual_high', false
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION update_trade_high_watermark TO authenticated, service_role;
