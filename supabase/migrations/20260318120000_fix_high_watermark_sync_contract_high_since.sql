-- ============================================================================
-- Fix: update_trade_high_watermark should also write contract_high_since
-- so both canonical high-watermark fields stay in sync.
-- Before this fix, the tracker updated max_contract_price but left
-- contract_high_since stale, which could cause the generate-image endpoint
-- to show an incorrect "Contract High" value when newHighPrice is not
-- passed explicitly, and caused the edit-high route dedup check to
-- behave differently from the tracker.
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

  v_old_high := COALESCE(
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
  ELSE
    v_new_high := v_old_high;
  END IF;

  v_max_profit_dollars := GREATEST(0, (v_new_high - v_entry_price) * v_qty * v_multiplier);
  v_is_win := v_max_profit_dollars >= 100;

  IF v_is_win AND NOT v_was_already_win THEN
    UPDATE index_trades
    SET
      max_contract_price   = v_new_high,
      contract_high_since  = v_new_high,
      max_profit           = v_max_profit_dollars,
      profit_from_entry    = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      is_winning_trade     = true,
      is_win               = true,
      win_at               = now(),
      updated_at           = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',            true,
      'is_new_high',        v_is_new_high,
      'new_high',           v_new_high,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win',             v_is_win,
      'newly_won',          true
    );
  ELSIF v_is_new_high THEN
    UPDATE index_trades
    SET
      max_contract_price   = v_new_high,
      contract_high_since  = v_new_high,
      max_profit           = v_max_profit_dollars,
      profit_from_entry    = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      updated_at           = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',            true,
      'is_new_high',        true,
      'new_high',           v_new_high,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win',             v_is_win,
      'newly_won',          false
    );
  ELSE
    UPDATE index_trades
    SET
      profit_from_entry = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      updated_at        = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success',            true,
      'is_new_high',        false,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win',             v_is_win
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION update_trade_high_watermark TO authenticated, service_role;
