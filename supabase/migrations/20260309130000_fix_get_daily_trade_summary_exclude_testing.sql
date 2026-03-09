/*
  # Fix get_daily_trade_summary — exclude testing trades

  1. Problem
    - `get_daily_trade_summary` RPC returns trades where is_testing = true
    - These test trades appear in indices-daily-report-sender channel reports

  2. Fix
    - Add `AND (t.is_testing = false OR t.is_testing IS NULL)` to the WHERE clause
    - This ensures test trades are never included in automated channel reports

  3. Note
    - The function signature is unchanged so no callers need updating
*/

CREATE OR REPLACE FUNCTION get_daily_trade_summary(target_date date, author_id_param uuid DEFAULT NULL)
RETURNS TABLE (
  trade_id uuid,
  analysis_id uuid,
  author_id uuid,
  underlying_symbol text,
  direction text,
  strike numeric,
  expiry date,
  option_type text,
  entry_contract_price numeric,
  current_contract_price numeric,
  max_contract_price numeric,
  profit_from_entry numeric,
  max_profit numeric,
  is_winning_trade boolean,
  trade_outcome trade_outcome_type,
  status text,
  entry_time timestamptz,
  closed_time timestamptz,
  win_condition text,
  loss_condition text,
  telegram_channel_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as trade_id,
    t.analysis_id,
    t.author_id,
    t.underlying_index_symbol as underlying_symbol,
    t.direction,
    t.strike,
    t.expiry,
    t.option_type,
    COALESCE(
      (t.entry_contract_snapshot->>'last')::numeric,
      (t.entry_contract_snapshot->>'close')::numeric
    ) as entry_contract_price,
    COALESCE(t.manual_contract_price, t.current_contract) as current_contract_price,
    t.max_contract_price,
    t.profit_from_entry,
    t.max_profit,
    t.is_winning_trade,
    t.trade_outcome,
    t.status::text,
    t.created_at as entry_time,
    t.closed_at as closed_time,
    t.win_condition_met as win_condition,
    t.loss_condition_met as loss_condition,
    t.telegram_channel_id
  FROM index_trades t
  WHERE DATE(t.created_at AT TIME ZONE 'America/New_York') = target_date
    AND (author_id_param IS NULL OR t.author_id = author_id_param)
    AND (t.is_testing = false OR t.is_testing IS NULL)
  ORDER BY t.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
