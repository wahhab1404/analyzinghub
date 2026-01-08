/*
  # Add Current Contract Snapshot to Index Trades

  1. Changes
    - Add `current_contract_snapshot` JSONB field to store full real-time contract data
    - This includes bid, ask, mid, volume, open_interest, and timestamp
    - Used for generating accurate snapshots with current market data

  2. Purpose
    - Telegram messages and snapshot images need to show CURRENT bid/ask/volume
    - Previously only stored current_contract (price), not full snapshot
*/

-- Add current_contract_snapshot field
ALTER TABLE index_trades
ADD COLUMN IF NOT EXISTS current_contract_snapshot JSONB;

COMMENT ON COLUMN index_trades.current_contract_snapshot IS 'Full real-time contract snapshot with bid, ask, mid, volume, open_interest - updated by indices-trade-tracker';
