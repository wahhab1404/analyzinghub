/*
  # Add Contract URL Field to Trades

  1. Changes
    - Add `contract_url` field to `index_trades` table
    - This allows storing URLs to trading platform pages for screenshot generation
    - Optional field - if not provided, system generates HTML template instead

  2. Use Cases
    - Store TradingView chart URL
    - Store brokerage platform contract page
    - Store any public URL showing the contract
*/

ALTER TABLE index_trades
ADD COLUMN IF NOT EXISTS contract_url text;

COMMENT ON COLUMN index_trades.contract_url IS 'Optional URL to trading platform page for screenshot generation';
