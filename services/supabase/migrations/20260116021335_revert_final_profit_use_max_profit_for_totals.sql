/*
  # Revert Final Profit Change - Use Max Profit for Totals

  1. Problem
    - Previous migration incorrectly changed final_profit to use closing price
    - User wants Total P/L to show max_profit (highest profit achieved)
    - This represents the "best possible outcome" for each trade
  
  2. Solution
    - Revert final_profit calculation back to using max_profit
    - Keep max_profit as the primary metric for P/L calculations
    - Final profit should equal max profit at close
  
  3. Important
    - max_profit tracks the highest profit achieved during the trade
    - Total P/L = sum of all max_profit values
    - This shows the best performance achieved across all trades
*/

-- Drop the incorrect trigger
DROP TRIGGER IF EXISTS trigger_calculate_final_profit ON index_trades;
DROP FUNCTION IF EXISTS calculate_and_set_final_profit();

-- Update all closed trades: set final_profit = max_profit
UPDATE index_trades
SET final_profit = COALESCE(max_profit, profit_from_entry, 0)
WHERE status = 'closed';

-- Create trigger to set final_profit = max_profit when closing
CREATE OR REPLACE FUNCTION set_final_profit_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a trade transitions to closed status
  IF NEW.status = 'closed' AND (OLD.status IS NULL OR OLD.status != 'closed') THEN
    -- Set final_profit to max_profit (highest profit achieved)
    NEW.final_profit := COALESCE(NEW.max_profit, NEW.profit_from_entry, 0);
    
    -- Ensure closed_at is set
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := NOW();
    END IF;
    
    -- Update is_winning_trade based on max profit
    NEW.is_winning_trade := (COALESCE(NEW.max_profit, 0) > 100);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_set_final_profit_on_close
  BEFORE UPDATE ON index_trades
  FOR EACH ROW
  WHEN (NEW.status = 'closed')
  EXECUTE FUNCTION set_final_profit_on_close();

-- Log confirmation
DO $$
DECLARE
  total_profit numeric;
  trade_count integer;
BEGIN
  SELECT 
    COALESCE(SUM(max_profit), 0),
    COUNT(*)
  INTO total_profit, trade_count
  FROM index_trades
  WHERE status = 'closed';
  
  RAISE NOTICE 'Updated % closed trades', trade_count;
  RAISE NOTICE 'Total P/L (max_profit sum): $%', total_profit;
END $$;