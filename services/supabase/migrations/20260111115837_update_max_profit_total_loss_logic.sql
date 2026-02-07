/*
  # Update Max Profit Logic for Total Loss

  1. Changes
    - Update `update_trade_max_profit()` function to implement total loss logic
    - If trade never reaches $100 profit, max_profit represents total investment lost
    - If trade reaches $100+, max_profit tracks actual highest profit

  2. Logic
    - For winning trades (ever reached $100): max_profit = actual highest profit
    - For losing trades (never reached $100): max_profit = -totalInvestment
    - Total investment = entry_price * qty * multiplier
*/

-- Update the function to calculate max profit with total loss logic
CREATE OR REPLACE FUNCTION update_trade_max_profit()
RETURNS TRIGGER AS $$
DECLARE
  entry_contract_price numeric;
  current_price_val numeric;
  multiplier_val integer;
  qty_val integer;
  total_investment numeric;
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
  IF entry_contract_price > 0 AND current_price_val > 0 THEN
    -- Calculate current profit from entry in USD
    NEW.profit_from_entry = (current_price_val - entry_contract_price) * qty_val * multiplier_val;

    -- Calculate total investment
    total_investment = entry_contract_price * qty_val * multiplier_val;

    -- Update max profit logic:
    -- If profit ever reached $100+, track highest profit normally
    -- If profit never reached $100, max_profit = -totalInvestment (total loss)

    IF NEW.profit_from_entry >= 100 THEN
      -- This is or was a winning trade
      IF NEW.profit_from_entry > COALESCE(NEW.max_profit, 0) THEN
        NEW.max_profit = NEW.profit_from_entry;
        NEW.max_contract_price = current_price_val;
      END IF;
      NEW.is_winning_trade = true;
    ELSE
      -- Not yet a winning trade
      IF COALESCE(NEW.max_profit, 0) >= 100 THEN
        -- Was winning before, keep tracking highest profit
        IF NEW.profit_from_entry > NEW.max_profit THEN
          NEW.max_profit = NEW.profit_from_entry;
          NEW.max_contract_price = current_price_val;
        END IF;
      ELSE
        -- Never reached $100, consider as total loss
        NEW.max_profit = -total_investment;
        NEW.is_winning_trade = false;
      END IF;
    END IF;

    -- Determine trade outcome based on status and profit
    IF NEW.status = 'closed' OR NEW.win_condition_met IS NOT NULL OR NEW.loss_condition_met IS NOT NULL THEN
      IF NEW.max_profit >= 100 THEN
        IF NEW.max_profit >= 500 THEN
          NEW.trade_outcome = 'big_win';
        ELSE
          NEW.trade_outcome = 'small_win';
        END IF;
      ELSIF NEW.max_profit >= 0 THEN
        NEW.trade_outcome = 'breakeven';
      ELSE
        IF total_investment >= 500 THEN
          NEW.trade_outcome = 'big_loss';
        ELSE
          NEW.trade_outcome = 'small_loss';
        END IF;
      END IF;
    ELSE
      NEW.trade_outcome = 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing active trades to reflect the new logic
UPDATE index_trades
SET
  max_profit = CASE
    WHEN COALESCE(max_profit, 0) >= 100 THEN max_profit
    ELSE -(
      COALESCE(
        (entry_contract_snapshot->>'mid')::numeric,
        (entry_contract_snapshot->>'last')::numeric,
        (entry_contract_snapshot->>'close')::numeric,
        0
      ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100)
    )
  END,
  is_winning_trade = COALESCE(max_profit, 0) >= 100
WHERE status = 'active'
  AND entry_contract_snapshot IS NOT NULL;