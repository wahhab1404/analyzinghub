/*
  # Implement Canonical Contract Trade Logic

  ## Overview
  This migration refactors the entire contract trade system to match the canonical logic:
  - High watermark tracking (max contract price since entry)
  - Win rule: max_profit_dollars >= 100 → WIN (stays WIN)
  - Finalization rule: if WIN → pnl = max_profit, else → pnl = -total_cost
  - Proper multiplier usage (100 for options)
  - Idempotent finalization with counted_in_stats
  - Average adjustment counting

  ## Changes
  1. Add missing canonical fields
  2. Create canonical finalization function
  3. Fix compute_trade_outcome to use >= 100 threshold
  4. Add update_trade_high_watermark function for tracker
  5. Ensure idempotency with counted_in_stats
*/

-- ============================================================================
-- 1. ADD CANONICAL FIELDS IF MISSING
-- ============================================================================

DO $$
BEGIN
  -- Ensure max_profit field exists (stores max_profit_dollars)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'max_profit'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN max_profit NUMERIC(12, 2) DEFAULT 0;
  END IF;

  -- Ensure max_contract_price field exists (high_watermark_price)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'max_contract_price'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN max_contract_price NUMERIC(10, 4);
  END IF;

  -- Ensure entry_cost_usd exists (total_cost)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'entry_cost_usd'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN entry_cost_usd NUMERIC(12, 2);
  END IF;

  -- Add counted_in_stats for idempotency
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'counted_in_stats'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN counted_in_stats BOOLEAN DEFAULT false;
  END IF;

  -- Add win_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'win_at'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN win_at TIMESTAMPTZ;
  END IF;

  -- Ensure profit_from_entry exists (current profit)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'profit_from_entry'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN profit_from_entry NUMERIC(12, 2) DEFAULT 0;
  END IF;

  -- Ensure is_winning_trade exists (derived from max_profit >= 100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'is_winning_trade'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN is_winning_trade BOOLEAN DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN index_trades.max_profit IS 'Maximum profit in dollars: (high_watermark - entry_price) * qty * multiplier';
COMMENT ON COLUMN index_trades.max_contract_price IS 'High watermark: highest contract price observed since entry';
COMMENT ON COLUMN index_trades.entry_cost_usd IS 'Total cost basis: entry_price * qty * multiplier';
COMMENT ON COLUMN index_trades.counted_in_stats IS 'True if this trade has been counted in analyzer stats (prevents double counting)';
COMMENT ON COLUMN index_trades.win_at IS 'Timestamp when max_profit first reached >= $100';
COMMENT ON COLUMN index_trades.is_winning_trade IS 'True if max_profit >= $100 (stays true once achieved)';

-- ============================================================================
-- 2. CANONICAL FINALIZATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION finalize_trade_canonical(
  p_trade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade RECORD;
  v_entry_price NUMERIC;
  v_high_watermark NUMERIC;
  v_total_cost NUMERIC;
  v_max_profit_dollars NUMERIC;
  v_multiplier INTEGER;
  v_qty INTEGER;
  v_is_win BOOLEAN;
  v_final_pnl NUMERIC;
  v_outcome TEXT;
  v_result JSONB;
BEGIN
  -- Lock and get trade
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found');
  END IF;

  -- Check if already finalized
  IF v_trade.counted_in_stats THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already finalized',
      'final_pnl', v_trade.pnl_usd,
      'outcome', v_trade.outcome
    );
  END IF;

  -- Extract values
  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::NUMERIC,
    (v_trade.entry_contract_snapshot->>'last')::NUMERIC,
    0
  );

  v_high_watermark := COALESCE(
    v_trade.max_contract_price,
    v_trade.peak_price_after_entry,
    v_trade.contract_high_since,
    v_entry_price
  );

  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty := COALESCE(v_trade.qty, 1);
  v_total_cost := COALESCE(v_trade.entry_cost_usd, v_entry_price * v_qty * v_multiplier);

  -- Calculate max profit dollars
  v_max_profit_dollars := GREATEST(0, (v_high_watermark - v_entry_price) * v_qty * v_multiplier);

  -- Apply canonical finalization rules
  IF v_max_profit_dollars >= 100 THEN
    -- WIN: pnl = max_profit
    v_is_win := true;
    v_final_pnl := v_max_profit_dollars;
    v_outcome := 'win';
  ELSE
    -- LOSS: pnl = -total_cost
    v_is_win := false;
    v_final_pnl := -v_total_cost;
    v_outcome := 'loss';
  END IF;

  -- Update trade with finalized values
  UPDATE index_trades
  SET
    max_profit = v_max_profit_dollars,
    pnl_usd = v_final_pnl,
    final_profit = v_final_pnl,
    computed_profit_usd = v_final_pnl,
    is_win = v_is_win,
    is_winning_trade = v_is_win,
    outcome = v_outcome,
    trade_outcome = CASE WHEN v_is_win THEN 'win'::trade_outcome_type ELSE 'loss'::trade_outcome_type END,
    counted_in_stats = true,
    updated_at = now()
  WHERE id = p_trade_id;

  v_result := jsonb_build_object(
    'success', true,
    'trade_id', p_trade_id,
    'final_pnl', v_final_pnl,
    'max_profit_dollars', v_max_profit_dollars,
    'total_cost', v_total_cost,
    'high_watermark', v_high_watermark,
    'entry_price', v_entry_price,
    'is_win', v_is_win,
    'outcome', v_outcome
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_trade_canonical TO authenticated, service_role;

-- ============================================================================
-- 3. FIX COMPUTE_TRADE_OUTCOME TO USE CANONICAL RULES
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_trade_outcome(
  p_trade_id UUID
) RETURNS TABLE(
  is_win BOOLEAN,
  computed_profit_usd DECIMAL,
  peak_profit_usd DECIMAL,
  should_award_points BOOLEAN
) AS $$
DECLARE
  v_trade RECORD;
  v_entry_price DECIMAL;
  v_high_watermark DECIMAL;
  v_multiplier INTEGER;
  v_qty INTEGER;
  v_total_cost DECIMAL;
  v_max_profit_dollars DECIMAL;
  v_is_win BOOLEAN;
  v_computed_profit DECIMAL;
BEGIN
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found: %', p_trade_id;
  END IF;

  -- Extract entry price
  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::DECIMAL,
    (v_trade.entry_contract_snapshot->>'last')::DECIMAL,
    0
  );

  -- Get high watermark
  v_high_watermark := COALESCE(
    v_trade.max_contract_price,
    v_trade.peak_price_after_entry,
    v_trade.contract_high_since,
    v_entry_price
  );

  v_multiplier := COALESCE(v_trade.contract_multiplier, 100);
  v_qty := COALESCE(v_trade.qty, 1);
  v_total_cost := COALESCE(v_trade.entry_cost_usd, v_entry_price * v_multiplier * v_qty);

  -- Calculate max profit dollars (canonical)
  v_max_profit_dollars := GREATEST(0, (v_high_watermark - v_entry_price) * v_multiplier * v_qty);

  -- Canonical win rule: >= 100 (not > 100)
  v_is_win := v_max_profit_dollars >= 100;

  -- Canonical finalization rule
  IF v_is_win THEN
    v_computed_profit := v_max_profit_dollars;
  ELSE
    v_computed_profit := -v_total_cost;
  END IF;

  -- Update trade with computed values
  UPDATE index_trades
  SET
    max_profit = v_max_profit_dollars,
    is_win = v_is_win,
    is_winning_trade = v_is_win,
    computed_profit_usd = v_computed_profit,
    updated_at = now()
  WHERE id = p_trade_id;

  RETURN QUERY SELECT
    v_is_win,
    v_computed_profit,
    v_max_profit_dollars,
    true;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION compute_trade_outcome TO authenticated, service_role;

-- ============================================================================
-- 4. HIGH WATERMARK UPDATE FUNCTION (FOR TRACKER)
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
  -- Get trade (no lock needed for reads during active tracking)
  SELECT * INTO v_trade
  FROM index_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trade not found');
  END IF;

  -- Extract values
  v_entry_price := COALESCE(
    (v_trade.entry_contract_snapshot->>'mid')::NUMERIC,
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

  -- Check if new high
  IF p_current_price > v_old_high THEN
    v_new_high := p_current_price;
    v_is_new_high := true;
  ELSE
    v_new_high := v_old_high;
  END IF;

  -- Calculate max profit dollars with new high
  v_max_profit_dollars := GREATEST(0, (v_new_high - v_entry_price) * v_qty * v_multiplier);

  -- Check win status (canonical rule: >= 100)
  v_is_win := v_max_profit_dollars >= 100;

  -- If this is the first time reaching win status, record timestamp
  IF v_is_win AND NOT v_was_already_win THEN
    UPDATE index_trades
    SET
      max_contract_price = v_new_high,
      max_profit = v_max_profit_dollars,
      profit_from_entry = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      is_winning_trade = true,
      is_win = true,
      win_at = now(),
      updated_at = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success', true,
      'is_new_high', v_is_new_high,
      'new_high', v_new_high,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win', v_is_win,
      'newly_won', true
    );
  ELSIF v_is_new_high THEN
    -- Just update high watermark
    UPDATE index_trades
    SET
      max_contract_price = v_new_high,
      max_profit = v_max_profit_dollars,
      profit_from_entry = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      updated_at = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success', true,
      'is_new_high', true,
      'new_high', v_new_high,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win', v_is_win,
      'newly_won', false
    );
  ELSE
    -- No changes needed, just update current profit
    UPDATE index_trades
    SET
      profit_from_entry = (p_current_price - v_entry_price) * v_qty * v_multiplier,
      updated_at = now()
    WHERE id = p_trade_id;

    v_result := jsonb_build_object(
      'success', true,
      'is_new_high', false,
      'max_profit_dollars', v_max_profit_dollars,
      'is_win', v_is_win
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION update_trade_high_watermark TO authenticated, service_role;

-- ============================================================================
-- 5. UPDATE EXPIRED TRADES CLOSER TO USE CANONICAL FINALIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION close_expired_trades()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_trade RECORD;
  v_closed_count INTEGER := 0;
  v_finalization_result JSONB;
BEGIN
  FOR v_expired_trade IN
    SELECT id, expiry, polygon_option_ticker
    FROM index_trades
    WHERE status = 'active'
    AND expiry IS NOT NULL
    AND expiry < CURRENT_DATE
  LOOP
    -- Use canonical finalization
    SELECT finalize_trade_canonical(v_expired_trade.id) INTO v_finalization_result;

    -- Mark as expired
    UPDATE index_trades
    SET
      status = 'expired',
      closed_at = now(),
      closure_reason = 'EXPIRED'
    WHERE id = v_expired_trade.id;

    v_closed_count := v_closed_count + 1;

    RAISE NOTICE 'Expired trade %: %', v_expired_trade.id, v_finalization_result;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'closed_count', v_closed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION close_expired_trades TO authenticated, service_role;

-- ============================================================================
-- 6. CREATE INDEX FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_index_trades_counted_in_stats
  ON index_trades(counted_in_stats) WHERE counted_in_stats = false;

CREATE INDEX IF NOT EXISTS idx_index_trades_is_winning_trade
  ON index_trades(is_winning_trade) WHERE is_winning_trade = true;

CREATE INDEX IF NOT EXISTS idx_index_trades_win_at
  ON index_trades(win_at DESC) WHERE win_at IS NOT NULL;
