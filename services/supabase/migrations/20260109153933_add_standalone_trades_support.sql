/*
  # Add Standalone Trades Support

  1. Changes
    - Make `analysis_id` nullable in `index_trades` table
    - Allow trades to exist without being linked to an analysis
    - Trades can now be created independently or linked to analyses
  
  2. Security
    - No RLS changes needed as existing policies work with nullable analysis_id
*/

-- Make analysis_id nullable
ALTER TABLE index_trades 
ALTER COLUMN analysis_id DROP NOT NULL;

-- Add comment to clarify
COMMENT ON COLUMN index_trades.analysis_id IS 'Optional reference to parent analysis. Can be null for standalone trades.';