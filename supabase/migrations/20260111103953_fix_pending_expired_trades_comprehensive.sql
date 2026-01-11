/*
  # Fix Pending and Expired Trades Comprehensive Update

  1. Problem
    - Many expired trades have `trade_outcome = 'pending'` instead of proper outcomes
    - Some trades have `status = 'expired'` instead of `status = 'closed'`
    - Profit calculations need to be verified and recalculated

  2. Solution
    - Update all expired trades to have status = 'closed'
    - Recalculate trade_outcome based on max_profit:
      * max_profit >= 500: 'big_win'
      * max_profit >= 100 and < 500: 'small_win'
      * max_profit < -500: 'big_loss'
      * max_profit < 0 and >= -500: 'small_loss'
      * max_profit >= 0 and < 100: 'breakeven' (if it's close to 0)
    - Ensure is_winning_trade aligns with max_profit >= 100
    - Set closed_at if null for expired trades

  3. Logic
    - Contract expiry happens at END of day (11:59:59 PM)
    - If expiry date has passed (expiry < CURRENT_DATE), trade should be closed
*/

-- Step 1: Update all expired trades that have passed their expiry date
-- Change status from 'expired' or 'active' to 'closed'
UPDATE index_trades
SET 
  status = 'closed',
  closed_at = COALESCE(closed_at, NOW())
WHERE instrument_type = 'options'
  AND expiry IS NOT NULL
  AND expiry < CURRENT_DATE
  AND status IN ('expired', 'active');

-- Step 2: Recalculate trade_outcome for all trades with 'pending' outcome
-- This includes both expired and manually closed trades
UPDATE index_trades
SET 
  trade_outcome = CASE
    -- Big Win: max_profit >= $500
    WHEN COALESCE(max_profit, 0) >= 500 THEN 'big_win'::trade_outcome_type
    
    -- Small Win: max_profit >= $100 and < $500
    WHEN COALESCE(max_profit, 0) >= 100 AND COALESCE(max_profit, 0) < 500 THEN 'small_win'::trade_outcome_type
    
    -- Big Loss: max_profit < -$500
    WHEN COALESCE(max_profit, 0) < -500 THEN 'big_loss'::trade_outcome_type
    
    -- Small Loss: max_profit < 0 and >= -$500
    WHEN COALESCE(max_profit, 0) < 0 AND COALESCE(max_profit, 0) >= -500 THEN 'small_loss'::trade_outcome_type
    
    -- Breakeven: max_profit between 0 and $100
    ELSE 'breakeven'::trade_outcome_type
  END,
  
  -- Ensure is_winning_trade is correct (true if max_profit >= $100)
  is_winning_trade = CASE
    WHEN COALESCE(max_profit, 0) >= 100 THEN true
    ELSE false
  END,
  
  -- For winning trades, profit_from_entry should equal max_profit
  -- For losing trades, profit_from_entry should be 0 (per auto-closer logic)
  profit_from_entry = CASE
    WHEN COALESCE(max_profit, 0) >= 100 THEN max_profit
    ELSE 0
  END

WHERE trade_outcome = 'pending';

-- Step 3: Add a note to all auto-closed expired trades if they don't have one
UPDATE index_trades
SET 
  notes = COALESCE(notes, '') || 
    CASE 
      WHEN COALESCE(notes, '') = '' THEN ''
      ELSE E'\n\n'
    END ||
    '[AUTO-FIXED] Trade outcome recalculated on ' || NOW()::date || '. Max profit: $' || COALESCE(max_profit, 0)::text
WHERE instrument_type = 'options'
  AND expiry IS NOT NULL
  AND expiry < CURRENT_DATE
  AND status = 'closed'
  AND (notes IS NULL OR notes NOT LIKE '%[AUTO-FIXED]%');

-- Log the results
DO $$
DECLARE
  expired_count INTEGER;
  pending_count INTEGER;
  winning_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO expired_count
  FROM index_trades
  WHERE instrument_type = 'options'
    AND expiry < CURRENT_DATE
    AND status = 'closed';
    
  SELECT COUNT(*) INTO pending_count
  FROM index_trades
  WHERE trade_outcome = 'pending';
  
  SELECT COUNT(*) INTO winning_count
  FROM index_trades
  WHERE is_winning_trade = true
    AND max_profit >= 100;
    
  RAISE NOTICE 'Fixed expired trades: %', expired_count;
  RAISE NOTICE 'Remaining pending outcomes: %', pending_count;
  RAISE NOTICE 'Winning trades verified: %', winning_count;
END $$;
