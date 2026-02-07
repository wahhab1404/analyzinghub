/*
  # Fix Final Profit Calculation for Closed Trades

  1. Problem
    - final_profit was being set to max_profit when trades close
    - This is incorrect - final_profit should be the profit at CLOSING time
    - If a trade reached +$500 max profit but closed at +$200, final_profit should be $200

  2. Solution
    - Update trigger to calculate final_profit from current_contract price at close
    - Formula: (current_contract - entry_price) * 100
    - Entry price from entry_contract_snapshot (mid or last)

  3. Backfill
    - Recalculate final_profit for all existing closed trades
*/

-- Drop the incorrect trigger
DROP TRIGGER IF EXISTS trigger_update_trade_final_profit ON index_trades;
DROP FUNCTION IF EXISTS update_trade_final_profit();

-- Create correct function to calculate final profit
CREATE OR REPLACE FUNCTION calculate_and_set_final_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_price numeric;
  v_current_price numeric;
  v_calculated_profit numeric;
BEGIN
  -- When a trade transitions to closed status
  IF NEW.status = 'closed' AND (OLD.status IS NULL OR OLD.status != 'closed') THEN
    -- Get entry price from snapshot
    v_entry_price := COALESCE(
      (NEW.entry_contract_snapshot->>'mid')::numeric,
      (NEW.entry_contract_snapshot->>'last')::numeric,
      0
    );
    
    -- Get current/closing price
    v_current_price := COALESCE(NEW.current_contract, 0);
    
    -- Calculate actual profit at closing time
    -- Formula: (closing_price - entry_price) * 100 (contract multiplier)
    IF v_entry_price > 0 AND v_current_price > 0 THEN
      v_calculated_profit := (v_current_price - v_entry_price) * 100;
      NEW.final_profit := v_calculated_profit;
    ELSE
      -- Fallback to existing values if calculation not possible
      NEW.final_profit := COALESCE(NEW.final_profit, NEW.max_profit, NEW.profit_from_entry, 0);
    END IF;
    
    -- Ensure closed_at is set
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := NOW();
    END IF;
    
    -- Update is_winning_trade based on final profit
    NEW.is_winning_trade := (NEW.final_profit > 0);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_calculate_final_profit
  BEFORE UPDATE ON index_trades
  FOR EACH ROW
  WHEN (NEW.status = 'closed')
  EXECUTE FUNCTION calculate_and_set_final_profit();

-- Backfill: Recalculate final_profit for all existing closed trades
DO $$
DECLARE
  v_trade record;
  v_entry_price numeric;
  v_current_price numeric;
  v_calculated_profit numeric;
BEGIN
  FOR v_trade IN 
    SELECT id, entry_contract_snapshot, current_contract, max_profit, profit_from_entry
    FROM index_trades 
    WHERE status = 'closed'
  LOOP
    -- Get entry price
    v_entry_price := COALESCE(
      (v_trade.entry_contract_snapshot->>'mid')::numeric,
      (v_trade.entry_contract_snapshot->>'last')::numeric,
      0
    );
    
    -- Get closing price
    v_current_price := COALESCE(v_trade.current_contract, 0);
    
    -- Calculate profit
    IF v_entry_price > 0 AND v_current_price > 0 THEN
      v_calculated_profit := (v_current_price - v_entry_price) * 100;
      
      -- Update the trade with correct final_profit
      UPDATE index_trades
      SET 
        final_profit = v_calculated_profit,
        is_winning_trade = (v_calculated_profit > 0)
      WHERE id = v_trade.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Recalculated final_profit for all closed trades';
END $$;