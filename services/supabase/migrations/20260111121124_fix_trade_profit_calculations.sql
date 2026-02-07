/*
  # Fix Trade Profit Calculations

  1. Problem
    - Losing trades show profit_from_entry = 0 instead of actual loss
    - Max profit tracking doesn't capture final profit for closed trades
    - Trade outcomes showing "breakeven" when they're actually losses

  2. Solution
    - Add `final_profit` column to track profit at time of closing
    - Fix all closed trades to show actual final profit
    - Recalculate trade outcomes based on FINAL profit, not max profit
    - Update trigger to track final profit when trade closes

  3. Logic
    - For active trades: show current profit (profit_from_entry)
    - For closed trades: show final profit at closing time
    - Max profit = highest profit ever reached (for analytics)
    - Final profit = actual profit when trade was closed
*/

-- Add final_profit column to track actual closing profit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'index_trades' AND column_name = 'final_profit'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN final_profit numeric(10, 2);
    COMMENT ON COLUMN index_trades.final_profit IS 'Actual profit/loss when trade was closed (can be negative)';
  END IF;
END $$;

-- Update the trigger function to capture final profit when closing
CREATE OR REPLACE FUNCTION update_trade_max_profit()
RETURNS TRIGGER AS $$
DECLARE
  entry_contract_price numeric;
  current_price_val numeric;
  multiplier_val integer;
  qty_val integer;
BEGIN
  -- Get entry price from snapshot
  entry_contract_price = COALESCE(
    (NEW.entry_contract_snapshot->>'mid')::numeric,
    (NEW.entry_contract_snapshot->>'last')::numeric,
    (NEW.entry_contract_snapshot->>'close')::numeric,
    0
  );

  -- Get current price (manual override takes precedence)
  current_price_val = COALESCE(NEW.manual_contract_price, NEW.current_contract, 0);

  -- Get multiplier and quantity
  multiplier_val = COALESCE(NEW.contract_multiplier, 100);
  qty_val = COALESCE(NEW.qty, 1);

  -- Only calculate if we have valid prices
  IF entry_contract_price > 0 THEN
    -- Calculate current profit from entry in USD (can be negative)
    NEW.profit_from_entry = (current_price_val - entry_contract_price) * qty_val * multiplier_val;

    -- Update max profit if current profit is higher (only track upside)
    IF NEW.profit_from_entry > COALESCE(NEW.max_profit, -999999) THEN
      NEW.max_profit = NEW.profit_from_entry;
      NEW.max_contract_price = current_price_val;
    END IF;

    -- If trade is being closed, capture final profit
    IF NEW.status = 'closed' AND (OLD.status IS NULL OR OLD.status != 'closed') THEN
      NEW.final_profit = NEW.profit_from_entry;
    END IF;

    -- Mark as winning trade if max profit > $100 OR final profit > $100
    NEW.is_winning_trade = (
      COALESCE(NEW.max_profit, 0) > 100
      OR COALESCE(NEW.final_profit, 0) > 100
    );

    -- Determine trade outcome based on FINAL profit for closed trades
    IF NEW.status = 'closed' THEN
      DECLARE
        outcome_profit numeric;
      BEGIN
        -- Use final profit if available, otherwise max profit
        outcome_profit = COALESCE(NEW.final_profit, NEW.max_profit, NEW.profit_from_entry);

        IF outcome_profit >= 500 THEN
          NEW.trade_outcome = 'big_win';
        ELSIF outcome_profit >= 100 THEN
          NEW.trade_outcome = 'small_win';
        ELSIF outcome_profit >= -100 THEN
          NEW.trade_outcome = 'breakeven';
        ELSIF outcome_profit >= -500 THEN
          NEW.trade_outcome = 'small_loss';
        ELSE
          NEW.trade_outcome = 'big_loss';
        END IF;
      END;
    ELSE
      NEW.trade_outcome = 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_update_trade_max_profit ON index_trades;
CREATE TRIGGER trigger_update_trade_max_profit
  BEFORE INSERT OR UPDATE OF current_contract, manual_contract_price, status, win_condition_met, loss_condition_met
  ON index_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_max_profit();

-- Fix all existing closed trades
-- Recalculate final profit for closed trades based on their current contract price at closing
UPDATE index_trades
SET
  final_profit = (
    COALESCE(manual_contract_price, current_contract, 0) -
    COALESCE(
      (entry_contract_snapshot->>'mid')::numeric,
      (entry_contract_snapshot->>'last')::numeric,
      (entry_contract_snapshot->>'close')::numeric,
      0
    )
  ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100),

  -- Also update profit_from_entry to show actual profit/loss (not 0)
  profit_from_entry = (
    COALESCE(manual_contract_price, current_contract, 0) -
    COALESCE(
      (entry_contract_snapshot->>'mid')::numeric,
      (entry_contract_snapshot->>'last')::numeric,
      (entry_contract_snapshot->>'close')::numeric,
      0
    )
  ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100)

WHERE status = 'closed'
  AND entry_contract_snapshot IS NOT NULL;

-- Recalculate trade outcomes based on FINAL profit
UPDATE index_trades
SET
  trade_outcome = CASE
    WHEN COALESCE(final_profit, profit_from_entry, 0) >= 500 THEN 'big_win'::trade_outcome_type
    WHEN COALESCE(final_profit, profit_from_entry, 0) >= 100 THEN 'small_win'::trade_outcome_type
    WHEN COALESCE(final_profit, profit_from_entry, 0) >= -100 THEN 'breakeven'::trade_outcome_type
    WHEN COALESCE(final_profit, profit_from_entry, 0) >= -500 THEN 'small_loss'::trade_outcome_type
    ELSE 'big_loss'::trade_outcome_type
  END,

  is_winning_trade = COALESCE(final_profit, profit_from_entry, 0) >= 100

WHERE status = 'closed';

-- Log results
DO $$
DECLARE
  big_loss_count INTEGER;
  small_loss_count INTEGER;
  breakeven_count INTEGER;
  small_win_count INTEGER;
  big_win_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO big_loss_count FROM index_trades WHERE trade_outcome = 'big_loss';
  SELECT COUNT(*) INTO small_loss_count FROM index_trades WHERE trade_outcome = 'small_loss';
  SELECT COUNT(*) INTO breakeven_count FROM index_trades WHERE trade_outcome = 'breakeven';
  SELECT COUNT(*) INTO small_win_count FROM index_trades WHERE trade_outcome = 'small_win';
  SELECT COUNT(*) INTO big_win_count FROM index_trades WHERE trade_outcome = 'big_win';

  RAISE NOTICE 'Trade outcomes recalculated:';
  RAISE NOTICE '  Big Wins: %', big_win_count;
  RAISE NOTICE '  Small Wins: %', small_win_count;
  RAISE NOTICE '  Breakeven: %', breakeven_count;
  RAISE NOTICE '  Small Losses: %', small_loss_count;
  RAISE NOTICE '  Big Losses: %', big_loss_count;
END $$;
