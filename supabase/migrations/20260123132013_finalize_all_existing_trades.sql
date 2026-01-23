/*
  # Finalize All Existing Closed and Expired Trades
  
  1. Updates
    - Calculate `computed_profit_usd` for all closed/expired trades
    - Set `is_win` based on profit/loss
    - Update `peak_price_after_entry` from `contract_high_since`
    - Ensure all stats are properly calculated
    
  2. Logic
    - Expired trades where current_contract = 0: Total loss of entry cost
    - Closed trades: Use peak price or current price to calculate profit
    - Win if profit > 0, loss if profit <= 0
*/

-- First, update peak_price_after_entry from contract_high_since where missing
UPDATE index_trades
SET peak_price_after_entry = contract_high_since
WHERE peak_price_after_entry IS NULL 
  AND contract_high_since IS NOT NULL
  AND status IN ('closed', 'expired');

-- Calculate and set profit/loss for all closed and expired trades
UPDATE index_trades
SET 
  computed_profit_usd = CASE
    -- If expired and current price is 0 or near 0, it's a total loss
    WHEN status = 'expired' AND (current_contract = 0 OR current_contract < 0.01) THEN
      -1 * (
        COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                 (entry_contract_snapshot->>'last')::numeric, 0) 
        * COALESCE(contract_multiplier, 100) 
        * COALESCE(qty, 1)
      )
    -- If closed, calculate based on peak or current price
    WHEN status = 'closed' THEN
      (COALESCE(peak_price_after_entry, contract_high_since, current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0))
      * COALESCE(contract_multiplier, 100) 
      * COALESCE(qty, 1)
    -- Default calculation for other cases
    ELSE
      (COALESCE(current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0))
      * COALESCE(contract_multiplier, 100) 
      * COALESCE(qty, 1)
  END,
  is_win = CASE
    -- Expired with 0 value is always a loss
    WHEN status = 'expired' AND (current_contract = 0 OR current_contract < 0.01) THEN false
    -- Closed: check if profit is positive
    WHEN status = 'closed' THEN
      (COALESCE(peak_price_after_entry, contract_high_since, current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0)) > 0
    -- Default: check current profit
    ELSE
      (COALESCE(current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0)) > 0
  END,
  updated_at = now()
WHERE status IN ('closed', 'expired')
  AND (computed_profit_usd IS NULL OR is_win IS NULL);

-- Update outcome field based on is_win
UPDATE index_trades
SET outcome = CASE
  WHEN is_win = true THEN 'win'
  WHEN is_win = false THEN 'loss'
  ELSE NULL
END
WHERE status IN ('closed', 'expired')
  AND outcome IS NULL;

-- Set trade_outcome enum if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'trade_outcome'
  ) THEN
    EXECUTE '
      UPDATE index_trades
      SET trade_outcome = CASE
        WHEN computed_profit_usd > 100 THEN ''big_win''::trade_outcome_type
        WHEN computed_profit_usd > 0 THEN ''small_win''::trade_outcome_type
        WHEN computed_profit_usd > -100 THEN ''small_loss''::trade_outcome_type
        WHEN computed_profit_usd <= -100 THEN ''big_loss''::trade_outcome_type
        ELSE ''breakeven''::trade_outcome_type
      END
      WHERE status IN (''closed'', ''expired'')
        AND trade_outcome IS NULL
        AND computed_profit_usd IS NOT NULL;
    ';
  END IF;
END $$;
