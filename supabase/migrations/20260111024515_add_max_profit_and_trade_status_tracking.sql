/*
  # Add Max Profit and Trade Status Tracking
  
  1. Changes to index_trades
    - Add `max_profit` column to track highest profit reached (in dollars)
    - Add `max_contract_price` column to track the highest contract price
    - Add `profit_from_entry` column for current profit calculation
    - Add `is_winning_trade` boolean (true if max profit > $100)
    - Add `trade_outcome` enum for final categorization
    - Add `daily_notified_at` timestamp for when daily notification was sent
    
  2. Functions
    - Create function to update max profit on price updates
    - Create function to get daily trade summary
    
  3. Security
    - Add necessary RLS policies
*/

-- Add new columns to index_trades
DO $$
BEGIN
  -- Max profit tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'max_profit'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN max_profit numeric(10, 2) DEFAULT 0;
    COMMENT ON COLUMN index_trades.max_profit IS 'Maximum profit reached in USD (contract_price - entry_price) * qty * multiplier';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'max_contract_price'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN max_contract_price numeric(10, 2);
    COMMENT ON COLUMN index_trades.max_contract_price IS 'Highest contract price reached during trade';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'profit_from_entry'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN profit_from_entry numeric(10, 2) DEFAULT 0;
    COMMENT ON COLUMN index_trades.profit_from_entry IS 'Current profit from entry in USD';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'is_winning_trade'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN is_winning_trade boolean DEFAULT false;
    COMMENT ON COLUMN index_trades.is_winning_trade IS 'True if max_profit ever exceeded $100';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'daily_notified_at'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN daily_notified_at timestamptz;
    COMMENT ON COLUMN index_trades.daily_notified_at IS 'When daily summary notification was sent for this trade';
  END IF;
END $$;

-- Create trade outcome enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_outcome_type') THEN
    CREATE TYPE trade_outcome_type AS ENUM ('big_win', 'small_win', 'breakeven', 'small_loss', 'big_loss', 'pending');
  END IF;
END $$;

-- Add trade outcome column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'index_trades' AND column_name = 'trade_outcome'
  ) THEN
    ALTER TABLE index_trades ADD COLUMN trade_outcome trade_outcome_type DEFAULT 'pending';
  END IF;
END $$;

-- Function to update max profit when price changes
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
    
    -- Update max profit if current profit is higher
    IF NEW.profit_from_entry > COALESCE(NEW.max_profit, 0) THEN
      NEW.max_profit = NEW.profit_from_entry;
      NEW.max_contract_price = current_price_val;
    END IF;
    
    -- Mark as winning trade if max profit > $100
    NEW.is_winning_trade = COALESCE(NEW.max_profit, 0) > 100;
    
    -- Determine trade outcome based on status and profit
    IF NEW.status = 'closed' OR NEW.win_condition_met IS NOT NULL OR NEW.loss_condition_met IS NOT NULL THEN
      IF NEW.profit_from_entry >= 100 THEN
        NEW.trade_outcome = 'big_win';
      ELSIF NEW.profit_from_entry >= 20 THEN
        NEW.trade_outcome = 'small_win';
      ELSIF NEW.profit_from_entry >= -20 THEN
        NEW.trade_outcome = 'breakeven';
      ELSIF NEW.profit_from_entry >= -50 THEN
        NEW.trade_outcome = 'small_loss';
      ELSE
        NEW.trade_outcome = 'big_loss';
      END IF;
    ELSE
      NEW.trade_outcome = 'pending';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for max profit tracking
DROP TRIGGER IF EXISTS trigger_update_trade_max_profit ON index_trades;
CREATE TRIGGER trigger_update_trade_max_profit
  BEFORE INSERT OR UPDATE OF current_contract, manual_contract_price, status, win_condition_met, loss_condition_met
  ON index_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_max_profit();

-- Function to get daily trade summary for a specific date
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
    t.status,
    t.created_at as entry_time,
    t.closed_at as closed_time,
    t.win_condition_met as win_condition,
    t.loss_condition_met as loss_condition,
    t.telegram_channel_id
  FROM index_trades t
  WHERE DATE(t.created_at AT TIME ZONE 'America/New_York') = target_date
    AND (author_id_param IS NULL OR t.author_id = author_id_param)
    AND t.status = 'live'
  ORDER BY t.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing trades to calculate initial max profit
UPDATE index_trades 
SET 
  profit_from_entry = (
    COALESCE(manual_contract_price, current_contract, 0) - 
    COALESCE(
      (entry_contract_snapshot->>'last')::numeric,
      (entry_contract_snapshot->>'close')::numeric,
      0
    )
  ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100),
  max_profit = GREATEST(
    COALESCE(max_profit, 0),
    (
      COALESCE(manual_contract_price, current_contract, 0) - 
      COALESCE(
        (entry_contract_snapshot->>'last')::numeric,
        (entry_contract_snapshot->>'close')::numeric,
        0
      )
    ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100)
  ),
  max_contract_price = CASE 
    WHEN (
      COALESCE(manual_contract_price, current_contract, 0) - 
      COALESCE(
        (entry_contract_snapshot->>'last')::numeric,
        (entry_contract_snapshot->>'close')::numeric,
        0
      )
    ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100) > COALESCE(max_profit, 0)
    THEN COALESCE(manual_contract_price, current_contract)
    ELSE max_contract_price 
  END,
  is_winning_trade = (
    (
      COALESCE(manual_contract_price, current_contract, 0) - 
      COALESCE(
        (entry_contract_snapshot->>'last')::numeric,
        (entry_contract_snapshot->>'close')::numeric,
        0
      )
    ) * COALESCE(qty, 1) * COALESCE(contract_multiplier, 100)
  ) > 100
WHERE entry_contract_snapshot IS NOT NULL;

-- Create indexes for faster daily queries
CREATE INDEX IF NOT EXISTS idx_index_trades_entry_date 
  ON index_trades ((DATE(created_at AT TIME ZONE 'America/New_York')));
  
CREATE INDEX IF NOT EXISTS idx_index_trades_daily_notified 
  ON index_trades (daily_notified_at) 
  WHERE daily_notified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_index_trades_outcome 
  ON index_trades (trade_outcome, status);
