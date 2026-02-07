/*
  # Fix Win Status Consistency
  
  1. Issue
    - Some trades have positive profit but is_win = false
    - is_win should match the +$1.00 rule
    
  2. Fix
    - Update is_win and outcome to match profit calculation
*/

-- Update is_win based on peak price achievement
UPDATE index_trades
SET 
  is_win = CASE
    WHEN COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
         (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                  (entry_contract_snapshot->>'last')::numeric, 0) + 1.00) THEN true
    ELSE false
  END,
  
  outcome = CASE
    WHEN COALESCE(peak_price_after_entry, contract_high_since, 0) >= 
         (COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                  (entry_contract_snapshot->>'last')::numeric, 0) + 1.00) THEN 'succeed'
    WHEN status = 'expired' THEN 'expired'
    ELSE 'loss'
  END,
  
  updated_at = now()
WHERE status IN ('closed', 'expired');
