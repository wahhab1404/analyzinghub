/*
  # Fix Win Condition: Require Minimum $100 Profit (v2)
  
  1. Business Rule
    - A trade is ONLY a win if peak price reached at least $1.00 above entry
    - This equals $100 profit minimum for 1 contract (100 multiplier)
    - Anything less is a loss, even if technically profitable
    
  2. Changes
    - Update is_win logic: peak >= entry + 1.00
    - Update computed_profit_usd to reflect actual P/L
    - Use 'succeed' instead of 'win' for outcome field
*/

-- Update win/loss status based on $1.00 minimum gain requirement
UPDATE index_trades
SET 
  is_win = CASE
    -- For expired trades where contract went to 0
    WHEN status = 'expired' AND (current_contract = 0 OR current_contract < 0.01) THEN
      -- Only win if peak was at least $1.00 above entry
      COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
      (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0) + 1.00)
    
    -- For closed trades
    WHEN status = 'closed' THEN
      -- Only win if peak was at least $1.00 above entry
      COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
      (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0) + 1.00)
    
    -- Default: check if current price is at least $1.00 above entry
    ELSE
      COALESCE(current_contract, 0) >= 
      (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0) + 1.00)
  END,
  
  -- Recalculate profit based on actual outcome
  computed_profit_usd = CASE
    -- Expired and worthless = total loss
    WHEN status = 'expired' AND (current_contract = 0 OR current_contract < 0.01) THEN
      -1 * (
        COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                 (entry_contract_snapshot->>'last')::numeric, 0) 
        * COALESCE(contract_multiplier, 100) 
        * COALESCE(qty, 1)
      )
    
    -- Closed or expired: use peak if it was a win, otherwise use final price
    WHEN status IN ('closed', 'expired') THEN
      -- If peak >= entry + 1.00, use peak profit (win)
      CASE 
        WHEN COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
             (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                      (entry_contract_snapshot->>'last')::numeric, 0) + 1.00) THEN
          (COALESCE(peak_price_after_entry, contract_high_since, 0) - 
           COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                    (entry_contract_snapshot->>'last')::numeric, 0))
          * COALESCE(contract_multiplier, 100) 
          * COALESCE(qty, 1)
        -- Otherwise use current/final price (likely a loss or small gain)
        ELSE
          (COALESCE(current_contract, 0) - 
           COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                    (entry_contract_snapshot->>'last')::numeric, 0))
          * COALESCE(contract_multiplier, 100) 
          * COALESCE(qty, 1)
      END
    
    -- Active trades: use current price
    ELSE
      (COALESCE(current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0))
      * COALESCE(contract_multiplier, 100) 
      * COALESCE(qty, 1)
  END,
  
  updated_at = now()
WHERE status IN ('closed', 'expired');

-- Update outcome field using correct values
UPDATE index_trades
SET outcome = CASE
  WHEN is_win = true THEN 'succeed'
  WHEN is_win = false AND status = 'expired' THEN 'expired'
  WHEN is_win = false THEN 'loss'
  ELSE NULL
END
WHERE status IN ('closed', 'expired');

-- Update trade_outcome enum if exists
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
        AND computed_profit_usd IS NOT NULL;
    ';
  END IF;
END $$;
