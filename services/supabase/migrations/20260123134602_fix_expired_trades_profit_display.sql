/*
  # Fix Expired Trades Profit Display
  
  1. Issue
    - Expired trades that reached +$1.00 still show negative profit
    - Should show the peak profit for wins, not the expired value
    
  2. Fix
    - If peak >= entry + $1.00: WIN, profit = peak profit
    - If peak < entry + $1.00: LOSS, profit = final loss
*/

UPDATE index_trades
SET 
  computed_profit_usd = CASE
    -- If peak reached +$1.00 above entry = WIN (use peak profit)
    WHEN COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
         (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                  (entry_contract_snapshot->>'last')::numeric, 0) + 1.00) THEN
      (COALESCE(peak_price_after_entry, contract_high_since, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0))
      * COALESCE(contract_multiplier, 100) 
      * COALESCE(qty, 1)
    
    -- Otherwise LOSS (use current/final price)
    ELSE
      (COALESCE(current_contract, 0) - 
       COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                (entry_contract_snapshot->>'last')::numeric, 0))
      * COALESCE(contract_multiplier, 100) 
      * COALESCE(qty, 1)
  END,
  
  updated_at = now()
WHERE status IN ('closed', 'expired');
