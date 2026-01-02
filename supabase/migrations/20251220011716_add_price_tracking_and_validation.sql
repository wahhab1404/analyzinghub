/*
  # Add Price Tracking and Validation System

  1. Schema Changes
    - Add `status` enum and column to `analyses` table
    - Add `validated_at` timestamp to `analyses` table
    - Create `price_snapshots` table for tracking price data
    - Create `validation_events` table for tracking validation results

  2. New Tables
    - `price_snapshots`
      - `id` (uuid, primary key)
      - `symbol` (text, the trading symbol)
      - `price` (numeric, the price at snapshot time)
      - `timestamp` (timestamptz, when snapshot was taken)
      - `created_at` (timestamptz)
    
    - `validation_events`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to analyses)
      - `event_type` (text, 'STOP_LOSS_HIT' | 'TARGET_HIT')
      - `target_number` (int, which target was hit, null for stop loss)
      - `price_at_hit` (numeric, price when target/stop loss was hit)
      - `hit_at` (timestamptz, when the event occurred)
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on new tables
    - Add policies for authenticated users to read validation events
    - Add policies for system to write validation data

  4. Important Notes
    - Status transitions: IN_PROGRESS → SUCCESS or FAILED
    - System-driven validation only, no manual overrides
    - All validation events are immutable audit logs
*/

-- Create analysis status enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysis_status') THEN
    CREATE TYPE analysis_status AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED');
  END IF;
END $$;

-- Add status and validated_at columns to analyses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'status'
  ) THEN
    ALTER TABLE analyses ADD COLUMN status analysis_status DEFAULT 'IN_PROGRESS' NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'validated_at'
  ) THEN
    ALTER TABLE analyses ADD COLUMN validated_at timestamptz;
  END IF;
END $$;

-- Create price_snapshots table
CREATE TABLE IF NOT EXISTS price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_price_snapshots_symbol_timestamp 
  ON price_snapshots(symbol, timestamp DESC);

-- Enable RLS on price_snapshots
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create new one
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can read price snapshots" ON price_snapshots;
END $$;

CREATE POLICY "Anyone can read price snapshots"
  ON price_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Create validation_events table
CREATE TABLE IF NOT EXISTS validation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('STOP_LOSS_HIT', 'TARGET_HIT')),
  target_number int CHECK (target_number > 0 AND target_number <= 3),
  price_at_hit numeric NOT NULL CHECK (price_at_hit > 0),
  hit_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT target_number_required_for_target_hit 
    CHECK (
      (event_type = 'TARGET_HIT' AND target_number IS NOT NULL) OR
      (event_type = 'STOP_LOSS_HIT' AND target_number IS NULL)
    )
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_validation_events_analysis_id 
  ON validation_events(analysis_id);

CREATE INDEX IF NOT EXISTS idx_validation_events_hit_at 
  ON validation_events(hit_at DESC);

-- Enable RLS on validation_events
ALTER TABLE validation_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then create new one
DO $$
BEGIN
  DROP POLICY IF EXISTS "Anyone can read validation events" ON validation_events;
END $$;

CREATE POLICY "Anyone can read validation events"
  ON validation_events FOR SELECT
  TO authenticated
  USING (true);

-- Create function to automatically update analysis status when validation event is created
CREATE OR REPLACE FUNCTION update_analysis_status_on_validation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE analyses
  SET 
    status = CASE 
      WHEN NEW.event_type = 'STOP_LOSS_HIT' THEN 'FAILED'::analysis_status
      WHEN NEW.event_type = 'TARGET_HIT' THEN 'SUCCESS'::analysis_status
    END,
    validated_at = NEW.hit_at
  WHERE id = NEW.analysis_id
  AND status = 'IN_PROGRESS'::analysis_status;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic status updates
DROP TRIGGER IF EXISTS trigger_update_analysis_status ON validation_events;
CREATE TRIGGER trigger_update_analysis_status
  AFTER INSERT ON validation_events
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_status_on_validation();