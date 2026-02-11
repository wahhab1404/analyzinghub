/*
  # Unified Contract Trades System with Canonical P/L Logic

  ## Overview
  Creates a comprehensive contract trades system supporting both company and index analyses
  with canonical P/L tracking that enforces $100 win threshold.

  ## New Tables
  
  ### `contract_trades`
  Unified table for all option/contract trades (companies + indices)
  
  **Key Fields:**
  - `id` (uuid, primary key)
  - `scope` (text) - 'company' | 'index' - REQUIRED field to distinguish trade type
  - `analysis_id` (uuid, nullable) - Links to analyses or index_analyses
  - `author_id` (uuid) - Trade creator
  - `symbol` (text) - Ticker symbol
  - `direction` (text) - CALL | PUT
  - `strike` (numeric) - Strike price
  - `expiry_date` (date) - Expiration date
  - `entry_time` (timestamptz) - When trade was entered
  - `entry_price` (numeric) - Contract entry price
  - `contracts_qty` (int, default 1) - Number of contracts
  - `contract_multiplier` (int, default 100) - Contract multiplier
  - `entry_cost_total` (numeric) - Total entry cost = entry_price * qty * multiplier
  - `status` (text) - ACTIVE | CLOSED | EXPIRED
  - `close_time` (timestamptz, nullable)
  - `close_reason` (text, nullable) - TARGET_WIN | STOPLOSS | MANUAL | EXPIRED
  
  **Canonical P/L Tracking:**
  - `max_price_since_entry` (numeric) - High watermark price
  - `max_profit_value` (numeric) - (max_price - entry_price) * qty * multiplier
  - `pnl_value` (numeric) - Final P/L (follows $100 threshold rules)
  - `is_win` (boolean) - True if max_profit_value >= 100
  - `win_threshold_met_at` (timestamptz, nullable) - When $100 threshold was reached
  
  **Average Entry Support:**
  - `avg_adjustments_count` (int, default 0) - Number of times entry was averaged
  - `original_entry_price` (numeric, nullable) - Original first entry price
  - `adjustment_history` (jsonb, default []) - History of adjustments
  
  **Telegram Integration:**
  - `telegram_message_ids` (jsonb, default []) - Array of message IDs
  - `telegram_channel_id` (uuid, nullable)
  - `telegram_published_at` (timestamptz, nullable)
  - `last_telegram_high_sent` (numeric, nullable) - Last high watermark sent to Telegram
  
  **Metadata:**
  - `notes` (text, nullable)
  - `targets` (jsonb, default []) - Target prices/percentages
  - `stoploss` (jsonb, nullable)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `created_by` (uuid)
  - `idempotency_key` (text, nullable) - For duplicate prevention

  ### `contract_trade_updates`
  Price update history for contract trades
  
  ### `report_trades`
  Junction table for reports and trades with dedupe constraints

  ## Indexes
  - Performance indexes on scope, symbol, status, author_id
  - Composite indexes for common queries
  - Unique constraints for dedupe

  ## Security
  - RLS enabled on all tables
  - Policies for authenticated users
  - Service role policies for background jobs

  ## Canonical P/L Rules
  
  The system enforces strict P/L calculation rules:
  
  1. **Win Condition:**
     - IF (max_price_since_entry - entry_price) * qty * multiplier >= 100
     - THEN: is_win = true
     - pnl_value = max_profit_value = (max_price - entry_price) * qty * multiplier
  
  2. **Loss Condition:**
     - IF max_profit_value < 100
     - THEN: is_win = false
     - pnl_value = -entry_cost_total (FULL ENTRY LOSS)
  
  3. **Expired Trades:**
     - Follow same rules: if never reached $100, it's a full loss
     - If reached $100 at any point, it's a win with max_profit_value
  
  4. **No Breakevens:**
     - System only recognizes WIN or LOSS
     - Small profits below $100 threshold are treated as losses
*/

-- Create enum types
DO $$ BEGIN
  CREATE TYPE trade_scope_type AS ENUM ('company', 'index');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_status_type AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_close_reason_type AS ENUM ('TARGET_WIN', 'STOPLOSS', 'MANUAL', 'EXPIRED', 'THRESHOLD_WIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create contract_trades table
CREATE TABLE IF NOT EXISTS contract_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trade identification
  scope trade_scope_type NOT NULL,
  analysis_id uuid,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Contract details
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('CALL', 'PUT', 'LONG', 'SHORT')),
  strike numeric NOT NULL,
  expiry_date date NOT NULL,
  polygon_option_ticker text,
  
  -- Entry data
  entry_time timestamptz NOT NULL DEFAULT now(),
  entry_price numeric NOT NULL CHECK (entry_price >= 0),
  contracts_qty integer NOT NULL DEFAULT 1 CHECK (contracts_qty > 0),
  contract_multiplier integer NOT NULL DEFAULT 100,
  entry_cost_total numeric GENERATED ALWAYS AS (entry_price * contracts_qty * contract_multiplier) STORED,
  
  -- Status
  status trade_status_type NOT NULL DEFAULT 'ACTIVE',
  close_time timestamptz,
  close_reason trade_close_reason_type,
  
  -- Canonical P/L tracking (ENFORCES $100 THRESHOLD)
  max_price_since_entry numeric DEFAULT 0,
  max_profit_value numeric GENERATED ALWAYS AS (
    CASE 
      WHEN max_price_since_entry > 0 
      THEN (max_price_since_entry - entry_price) * contracts_qty * contract_multiplier
      ELSE 0
    END
  ) STORED,
  pnl_value numeric,
  is_win boolean DEFAULT false,
  win_threshold_met_at timestamptz,
  
  -- Average entry support
  avg_adjustments_count integer NOT NULL DEFAULT 0,
  original_entry_price numeric,
  adjustment_history jsonb DEFAULT '[]'::jsonb,
  
  -- Telegram integration
  telegram_message_ids jsonb DEFAULT '[]'::jsonb,
  telegram_channel_id uuid,
  telegram_published_at timestamptz,
  last_telegram_high_sent numeric,
  
  -- Trading parameters
  targets jsonb DEFAULT '[]'::jsonb,
  stoploss jsonb,
  notes text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES profiles(id),
  idempotency_key text,
  
  -- Indexes
  CONSTRAINT valid_scope_analysis CHECK (
    (scope = 'company' AND analysis_id IS NOT NULL) OR
    (scope = 'index')
  )
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_trades_scope ON contract_trades(scope);
CREATE INDEX IF NOT EXISTS idx_contract_trades_symbol ON contract_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_contract_trades_status ON contract_trades(status);
CREATE INDEX IF NOT EXISTS idx_contract_trades_author ON contract_trades(author_id);
CREATE INDEX IF NOT EXISTS idx_contract_trades_analysis ON contract_trades(analysis_id) WHERE analysis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_trades_active ON contract_trades(status, author_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_contract_trades_company_active ON contract_trades(scope, symbol, status) WHERE scope = 'company' AND status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_contract_trades_idempotency ON contract_trades(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Composite index for duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_trades_unique_active 
ON contract_trades(author_id, scope, symbol, strike, expiry_date, direction) 
WHERE status = 'ACTIVE';

-- Create contract_trade_updates table
CREATE TABLE IF NOT EXISTS contract_trade_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES contract_trades(id) ON DELETE CASCADE,
  
  contract_price numeric NOT NULL,
  underlying_price numeric,
  
  high_watermark_before numeric,
  high_watermark_after numeric,
  is_new_high boolean DEFAULT false,
  
  profit_before numeric,
  profit_after numeric,
  
  telegram_sent boolean DEFAULT false,
  telegram_message_id text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_contract_trade_updates_trade ON contract_trade_updates(trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_trade_updates_new_highs ON contract_trade_updates(trade_id, is_new_high) WHERE is_new_high = true;

-- Create report_trades junction table with dedupe constraints
CREATE TABLE IF NOT EXISTS report_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES daily_trade_reports(id) ON DELETE CASCADE,
  trade_id uuid,
  trade_scope trade_scope_type NOT NULL,
  
  -- Denormalized trade data for report stability
  symbol text NOT NULL,
  direction text NOT NULL,
  strike numeric NOT NULL,
  expiry_date date NOT NULL,
  entry_time timestamptz NOT NULL,
  entry_price numeric NOT NULL,
  max_price numeric,
  pnl_value numeric,
  is_win boolean,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CRITICAL: Prevent duplicate trades in same report
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_trades_unique 
ON report_trades(report_id, trade_id) 
WHERE trade_id IS NOT NULL;

-- Also dedupe by trade characteristics if trade_id is null
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_trades_unique_by_data 
ON report_trades(report_id, trade_scope, symbol, strike, expiry_date, entry_time);

CREATE INDEX IF NOT EXISTS idx_report_trades_report ON report_trades(report_id);
CREATE INDEX IF NOT EXISTS idx_report_trades_trade ON report_trades(trade_id) WHERE trade_id IS NOT NULL;

-- Enable RLS
ALTER TABLE contract_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_trade_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_trades
CREATE POLICY "Users can view their own trades"
  ON contract_trades FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Users can create their own trades"
  ON contract_trades FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid() AND created_by = auth.uid());

CREATE POLICY "Users can update their own trades"
  ON contract_trades FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own trades"
  ON contract_trades FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access to contract_trades"
  ON contract_trades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for contract_trade_updates
CREATE POLICY "Users can view updates for their trades"
  ON contract_trade_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contract_trades ct
      WHERE ct.id = contract_trade_updates.trade_id
      AND ct.author_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage trade updates"
  ON contract_trade_updates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for report_trades
CREATE POLICY "Users can view their report trades"
  ON report_trades FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_trade_reports dtr
      WHERE dtr.id = report_trades.report_id
      AND dtr.author_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage report trades"
  ON report_trades FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to calculate canonical P/L
CREATE OR REPLACE FUNCTION calculate_canonical_pnl(
  p_entry_price numeric,
  p_max_price numeric,
  p_qty integer,
  p_multiplier integer
) RETURNS TABLE (
  pnl_value numeric,
  is_win boolean,
  max_profit numeric
) AS $$
DECLARE
  v_max_profit numeric;
  v_entry_cost numeric;
BEGIN
  -- Calculate maximum profit achieved
  v_max_profit := (p_max_price - p_entry_price) * p_qty * p_multiplier;
  v_entry_cost := p_entry_price * p_qty * p_multiplier;
  
  -- Apply $100 threshold rule
  IF v_max_profit >= 100 THEN
    -- WIN: profit is the maximum achieved
    RETURN QUERY SELECT v_max_profit, true, v_max_profit;
  ELSE
    -- LOSS: full entry cost lost
    RETURN QUERY SELECT -v_entry_cost, false, v_max_profit;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update trade P/L when max price changes
CREATE OR REPLACE FUNCTION update_trade_canonical_pnl()
RETURNS trigger AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Calculate canonical P/L
  SELECT * INTO v_result FROM calculate_canonical_pnl(
    NEW.entry_price,
    NEW.max_price_since_entry,
    NEW.contracts_qty,
    NEW.contract_multiplier
  );
  
  -- Update P/L fields
  NEW.pnl_value := v_result.pnl_value;
  NEW.is_win := v_result.is_win;
  
  -- Track when $100 threshold was first met
  IF v_result.is_win AND OLD.win_threshold_met_at IS NULL THEN
    NEW.win_threshold_met_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate P/L
DROP TRIGGER IF EXISTS trigger_update_canonical_pnl ON contract_trades;
CREATE TRIGGER trigger_update_canonical_pnl
  BEFORE INSERT OR UPDATE OF max_price_since_entry, entry_price, contracts_qty
  ON contract_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_canonical_pnl();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_trades_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_contract_trades_timestamp ON contract_trades;
CREATE TRIGGER trigger_update_contract_trades_timestamp
  BEFORE UPDATE ON contract_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_trades_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON contract_trades TO authenticated;
GRANT SELECT, INSERT ON contract_trade_updates TO authenticated;
GRANT SELECT ON report_trades TO authenticated;

GRANT ALL ON contract_trades TO service_role;
GRANT ALL ON contract_trade_updates TO service_role;
GRANT ALL ON report_trades TO service_role;

COMMENT ON TABLE contract_trades IS 'Unified contract trades table supporting both company and index analyses with canonical P/L tracking';
COMMENT ON COLUMN contract_trades.scope IS 'Distinguishes between company and index trades';
COMMENT ON COLUMN contract_trades.max_price_since_entry IS 'High watermark - highest price reached since entry';
COMMENT ON COLUMN contract_trades.max_profit_value IS 'Computed: (max_price - entry_price) * qty * multiplier';
COMMENT ON COLUMN contract_trades.pnl_value IS 'Canonical P/L: max_profit if >= $100, else -entry_cost_total';
COMMENT ON COLUMN contract_trades.is_win IS 'True if max_profit_value >= $100, else false';
COMMENT ON COLUMN contract_trades.entry_cost_total IS 'Computed: entry_price * qty * multiplier';
