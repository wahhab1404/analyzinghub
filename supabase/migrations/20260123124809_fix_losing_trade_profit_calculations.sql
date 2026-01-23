/*
  # Fix Losing Trade Profit Calculations

  1. Problem
    - Losing trades show profit_from_entry = 0 instead of the actual loss
    - Trade outcome shows "breakeven" when it should show losses
    - This makes performance statistics incorrect

  2. Root Cause
    - Previous migration incorrectly set profit_from_entry = 0 for losing trades
    - Should calculate: -(entry_price * qty * 100) for options that expire worthless

  3. Solution
    - For trades where max_profit < $100:
      * Calculate the total investment (entry_price × qty × 100)
      * Set profit_from_entry = -total_investment
      * Set correct trade_outcome based on loss amount
    - For trades where max_profit >= $100:
      * Keep profit_from_entry = max_profit

  4. Trade Outcome Logic
    - big_win: max_profit >= $500
    - small_win: $100 <= max_profit < $500
    - small_loss: -$500 < loss < $0
    - big_loss: loss <= -$500
    - breakeven: Only if truly $0 (no profit, no loss)
*/

-- Step 1: Fix all closed options trades with incorrect profit calculations
UPDATE index_trades
SET
  -- Calculate actual profit/loss
  profit_from_entry = CASE
    -- Winning trades: profit = max_profit
    WHEN COALESCE(max_profit, 0) >= 100 THEN max_profit

    -- Losing trades: calculate total loss
    -- Loss = -(entry_price × qty × multiplier)
    ELSE -(
      COALESCE(
        (entry_contract_snapshot->>'mid')::numeric,
        (entry_contract_snapshot->>'last')::numeric,
        0
      ) * COALESCE(qty, 1) * 100
    )
  END,

  -- Recalculate trade outcome based on actual P&L
  trade_outcome = CASE
    -- Use max_profit for winning trades
    WHEN COALESCE(max_profit, 0) >= 500 THEN 'big_win'::trade_outcome_type
    WHEN COALESCE(max_profit, 0) >= 100 THEN 'small_win'::trade_outcome_type

    -- Calculate loss amount for losing trades
    WHEN COALESCE(max_profit, 0) < 100 THEN
      CASE
        -- Big loss: total investment >= $500
        WHEN (
          COALESCE(
            (entry_contract_snapshot->>'mid')::numeric,
            (entry_contract_snapshot->>'last')::numeric,
            0
          ) * COALESCE(qty, 1) * 100
        ) >= 500 THEN 'big_loss'::trade_outcome_type

        -- Small loss: total investment < $500
        ELSE 'small_loss'::trade_outcome_type
      END

    ELSE 'breakeven'::trade_outcome_type
  END,

  -- Winning trade flag
  is_winning_trade = COALESCE(max_profit, 0) >= 100,

  -- Set current_contract to 0 for expired losing trades
  current_contract = CASE
    WHEN COALESCE(max_profit, 0) < 100 AND expiry < CURRENT_DATE THEN 0
    ELSE current_contract
  END

WHERE instrument_type = 'options'
  AND status = 'closed'
  -- Only update trades that need fixing
  AND (
    -- Trades with 0 profit but should show loss
    (profit_from_entry = 0 AND COALESCE(max_profit, 0) < 100)
    -- OR trades with wrong trade_outcome
    OR (trade_outcome = 'breakeven' AND COALESCE(max_profit, 0) < 100)
  );

-- Step 2: Create a function to properly calculate trade P&L
CREATE OR REPLACE FUNCTION calculate_option_trade_pnl(
  p_max_profit NUMERIC,
  p_entry_snapshot JSONB,
  p_qty INTEGER
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_entry_price NUMERIC;
  v_multiplier INTEGER := 100;
BEGIN
  -- Extract entry price from snapshot
  v_entry_price := COALESCE(
    (p_entry_snapshot->>'mid')::numeric,
    (p_entry_snapshot->>'last')::numeric,
    0
  );

  -- If max_profit >= $100, it's a winning trade
  IF COALESCE(p_max_profit, 0) >= 100 THEN
    RETURN p_max_profit;
  END IF;

  -- Otherwise, it's a losing trade - calculate total loss
  RETURN -(v_entry_price * COALESCE(p_qty, 1) * v_multiplier);
END;
$$;

-- Step 3: Add helpful comment
COMMENT ON FUNCTION calculate_option_trade_pnl IS
'Calculates the final P&L for an options trade. Returns max_profit for wins (>=100), or negative total investment for losses.';

-- Step 4: Verify the fix
DO $$
DECLARE
  v_total_trades INTEGER;
  v_winning_trades INTEGER;
  v_losing_trades INTEGER;
  v_breakeven_trades INTEGER;
  v_total_pnl NUMERIC;
  v_avg_win NUMERIC;
  v_avg_loss NUMERIC;
  v_win_rate NUMERIC;
BEGIN
  -- Count trades by category
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_winning_trade = true),
    COUNT(*) FILTER (WHERE is_winning_trade = false AND profit_from_entry < 0),
    COUNT(*) FILTER (WHERE profit_from_entry = 0)
  INTO v_total_trades, v_winning_trades, v_losing_trades, v_breakeven_trades
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed';

  -- Calculate P&L statistics
  SELECT
    COALESCE(SUM(profit_from_entry), 0),
    COALESCE(AVG(profit_from_entry) FILTER (WHERE is_winning_trade = true), 0),
    COALESCE(AVG(profit_from_entry) FILTER (WHERE is_winning_trade = false), 0)
  INTO v_total_pnl, v_avg_win, v_avg_loss
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed';

  -- Calculate win rate
  IF v_total_trades > 0 THEN
    v_win_rate := (v_winning_trades::numeric / v_total_trades) * 100;
  ELSE
    v_win_rate := 0;
  END IF;

  -- Output results
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TRADE PROFIT CALCULATION FIX COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Total Closed Trades: %', v_total_trades;
  RAISE NOTICE '  ├─ Winning Trades: % (%.1f%%)', v_winning_trades, v_win_rate;
  RAISE NOTICE '  ├─ Losing Trades: %', v_losing_trades;
  RAISE NOTICE '  └─ Breakeven Trades: %', v_breakeven_trades;
  RAISE NOTICE '';
  RAISE NOTICE 'P&L Statistics:';
  RAISE NOTICE '  ├─ Total P&L: $%.2f', v_total_pnl;
  RAISE NOTICE '  ├─ Average Win: $%.2f', v_avg_win;
  RAISE NOTICE '  └─ Average Loss: $%.2f', v_avg_loss;
  RAISE NOTICE '';
  RAISE NOTICE '========================================';

  -- Warning if there are still breakeven trades
  IF v_breakeven_trades > 0 THEN
    RAISE WARNING 'Found % breakeven trades - verify these are correct', v_breakeven_trades;
  END IF;
END $$;
