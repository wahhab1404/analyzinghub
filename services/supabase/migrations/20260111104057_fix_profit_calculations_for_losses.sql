/*
  # Fix Profit Calculations for Losing Trades

  1. Problem
    - Losing trades have profit_from_entry = 0, but they should show the actual LOSS
    - This makes it impossible to calculate accurate win/loss percentages

  2. Solution
    - For WINNING trades (max_profit >= 100): profit_from_entry = max_profit
    - For LOSING trades (max_profit < 100): profit_from_entry = max_profit (which is negative)
    - This way profit_from_entry always reflects the actual P&L

  3. Recalculate Logic
    - If max_profit >= 100: It's a win, profit_from_entry = max_profit
    - If max_profit < 100: It's not a win, profit_from_entry = max_profit (to show the actual loss)
*/

-- Update all trades to have correct profit_from_entry
-- For ALL trades, profit_from_entry should equal max_profit
-- This accurately reflects the P&L from entry to the highest profit point
UPDATE index_trades
SET 
  profit_from_entry = COALESCE(max_profit, 0),
  
  -- Ensure trade outcomes are correct based on max_profit
  trade_outcome = CASE
    WHEN COALESCE(max_profit, 0) >= 500 THEN 'big_win'::trade_outcome_type
    WHEN COALESCE(max_profit, 0) >= 100 AND COALESCE(max_profit, 0) < 500 THEN 'small_win'::trade_outcome_type
    WHEN COALESCE(max_profit, 0) < -500 THEN 'big_loss'::trade_outcome_type
    WHEN COALESCE(max_profit, 0) < 0 AND COALESCE(max_profit, 0) >= -500 THEN 'small_loss'::trade_outcome_type
    ELSE 'breakeven'::trade_outcome_type
  END,
  
  -- Winning trade = max_profit >= $100
  is_winning_trade = CASE
    WHEN COALESCE(max_profit, 0) >= 100 THEN true
    ELSE false
  END

WHERE instrument_type = 'options'
  AND status = 'closed';

-- Verify the fix with a summary
DO $$
DECLARE
  total_trades INTEGER;
  winning_trades INTEGER;
  losing_trades INTEGER;
  total_pnl NUMERIC;
  avg_win NUMERIC;
  avg_loss NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_trades
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed';
  
  SELECT COUNT(*) INTO winning_trades
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed' AND is_winning_trade = true;
  
  SELECT COUNT(*) INTO losing_trades
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed' AND is_winning_trade = false;
  
  SELECT SUM(profit_from_entry) INTO total_pnl
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed';
  
  SELECT AVG(profit_from_entry) INTO avg_win
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed' AND is_winning_trade = true;
  
  SELECT AVG(profit_from_entry) INTO avg_loss
  FROM index_trades
  WHERE instrument_type = 'options' AND status = 'closed' AND is_winning_trade = false;
  
  RAISE NOTICE '=== Trade Statistics ===';
  RAISE NOTICE 'Total Closed Trades: %', total_trades;
  RAISE NOTICE 'Winning Trades: % (%.1f%%)', winning_trades, (winning_trades::float / NULLIF(total_trades, 0) * 100);
  RAISE NOTICE 'Losing Trades: % (%.1f%%)', losing_trades, (losing_trades::float / NULLIF(total_trades, 0) * 100);
  RAISE NOTICE 'Total P&L: $%.2f', total_pnl;
  RAISE NOTICE 'Average Win: $%.2f', avg_win;
  RAISE NOTICE 'Average Loss: $%.2f', avg_loss;
END $$;
