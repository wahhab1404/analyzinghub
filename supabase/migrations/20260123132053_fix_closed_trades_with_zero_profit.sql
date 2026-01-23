/*
  # Fix Closed Trades Showing Zero Profit
  
  1. Issue
    - Some closed trades show $0 profit because peak = entry price
    - But current_contract = 0, meaning they expired worthless
    - These should be losses, not breakeven
    
  2. Fix
    - For closed trades where peak = entry AND current = 0
    - Calculate as total loss of entry cost
*/

-- Fix closed trades that show $0 profit but should be losses
UPDATE index_trades
SET 
  computed_profit_usd = -1 * (
    COALESCE((entry_contract_snapshot->>'mid')::numeric, 
             (entry_contract_snapshot->>'last')::numeric, 0) 
    * COALESCE(contract_multiplier, 100) 
    * COALESCE(qty, 1)
  ),
  is_win = false,
  updated_at = now()
WHERE status = 'closed'
  AND computed_profit_usd = 0
  AND (current_contract = 0 OR current_contract < 0.01)
  AND COALESCE(contract_high_since, 0) = COALESCE((entry_contract_snapshot->>'mid')::numeric, 
                                                   (entry_contract_snapshot->>'last')::numeric, 0);

-- Update outcome field for these fixed trades
UPDATE index_trades
SET outcome = 'loss'
WHERE status = 'closed'
  AND is_win = false
  AND outcome != 'loss';

-- Update trade_outcome enum if it exists
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
