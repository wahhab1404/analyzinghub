/*
  # Fix Breakeven Trade Outcomes for Losing Trades

  Some trades still show "breakeven" outcome when they should show "small_loss" or "big_loss"
  This happens when profit_from_entry is negative but trade_outcome wasn't updated.
*/

UPDATE index_trades
SET
  trade_outcome = CASE
    WHEN profit_from_entry >= 500 THEN 'big_win'::trade_outcome_type
    WHEN profit_from_entry >= 100 THEN 'small_win'::trade_outcome_type
    WHEN profit_from_entry <= -500 THEN 'big_loss'::trade_outcome_type
    WHEN profit_from_entry < 0 THEN 'small_loss'::trade_outcome_type
    ELSE 'breakeven'::trade_outcome_type
  END
WHERE instrument_type = 'options'
  AND status = 'closed'
  AND (
    (profit_from_entry < 0 AND trade_outcome = 'breakeven')
    OR (profit_from_entry >= 100 AND trade_outcome NOT IN ('small_win', 'big_win'))
  );
