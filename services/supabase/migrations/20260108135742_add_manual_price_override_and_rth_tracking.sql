/*
  # Add Manual Price Override and RTH Tracking

  1. New Fields
    - `manual_contract_price` - Analyzer can set price manually when outside RTH
    - `manual_contract_high` - Analyzer can manually update high
    - `manual_contract_low` - Analyzer can manually update low
    - `last_rth_tracking_at` - Last time RTH tracking updated prices
    - `is_using_manual_price` - Boolean flag indicating if using manual price

  2. Rules
    - Manual price override only allowed outside RTH
    - During RTH, system uses live prices
    - Analyzer can always manually update highs/lows
    - Track when last RTH update occurred

  3. Security
    - Only trade owner (analyzer) can set manual prices
    - Manual prices validated for reasonableness
*/

-- Add manual price override fields
ALTER TABLE index_trades
ADD COLUMN IF NOT EXISTS manual_contract_price NUMERIC(10, 4),
ADD COLUMN IF NOT EXISTS manual_contract_high NUMERIC(10, 4),
ADD COLUMN IF NOT EXISTS manual_contract_low NUMERIC(10, 4),
ADD COLUMN IF NOT EXISTS last_rth_tracking_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_using_manual_price BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN index_trades.manual_contract_price IS 'Manual price set by analyzer when outside RTH';
COMMENT ON COLUMN index_trades.manual_contract_high IS 'Manual high set by analyzer';
COMMENT ON COLUMN index_trades.manual_contract_low IS 'Manual low set by analyzer';
COMMENT ON COLUMN index_trades.last_rth_tracking_at IS 'Last time RTH tracking system updated prices';
COMMENT ON COLUMN index_trades.is_using_manual_price IS 'True if currently using manual price override (outside RTH)';

-- Add index for RTH tracking queries
CREATE INDEX IF NOT EXISTS idx_index_trades_rth_tracking 
ON index_trades(status, last_rth_tracking_at) 
WHERE status IN ('active', 'draft');
