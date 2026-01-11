/*
  # Add Activation Conditions to Index Analyses

  1. Changes
    - Add all activation condition columns to index_analyses table
    - Mirror the structure from analyses table
    - Add necessary indexes for performance

  2. Security
    - No RLS changes needed (inherits from existing policies)
*/

-- Add activation columns to index_analyses table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_enabled') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_type') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_type text CHECK (activation_type IN ('PASSING_PRICE', 'ABOVE_PRICE', 'UNDER_PRICE'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_price') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_timeframe') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_timeframe text CHECK (activation_timeframe IN ('INTRABAR', '1H_CLOSE', '4H_CLOSE', 'DAILY_CLOSE')) DEFAULT 'INTRABAR';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_status') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_status text CHECK (activation_status IN ('draft', 'published_inactive', 'active', 'completed_success', 'completed_fail', 'cancelled', 'expired')) DEFAULT 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activated_at') THEN
    ALTER TABLE index_analyses ADD COLUMN activated_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_met_at') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_met_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'activation_notes') THEN
    ALTER TABLE index_analyses ADD COLUMN activation_notes text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'preactivation_stop_touched') THEN
    ALTER TABLE index_analyses ADD COLUMN preactivation_stop_touched boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'preactivation_stop_touched_at') THEN
    ALTER TABLE index_analyses ADD COLUMN preactivation_stop_touched_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'last_eval_price') THEN
    ALTER TABLE index_analyses ADD COLUMN last_eval_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'index_analyses' AND column_name = 'last_eval_at') THEN
    ALTER TABLE index_analyses ADD COLUMN last_eval_at timestamptz;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_index_analyses_activation_status ON index_analyses(activation_status) WHERE activation_enabled = true;
CREATE INDEX IF NOT EXISTS idx_index_analyses_activation_enabled_status ON index_analyses(activation_enabled, activation_status) WHERE activation_enabled = true;

COMMENT ON COLUMN index_analyses.activation_enabled IS 'If true, analysis must meet activation condition before being considered active';
COMMENT ON COLUMN index_analyses.activation_status IS 'Current lifecycle status of the analysis';
COMMENT ON COLUMN index_analyses.preactivation_stop_touched IS 'True if stoploss was touched before activation (not counted as fail)';
