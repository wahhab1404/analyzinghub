/*
  # Analysis Activation Conditions System

  1. New Columns in analyses table
    - `activation_enabled` - Enable/disable activation conditions
    - `activation_type` - Type of condition (PASSING_PRICE, ABOVE_PRICE, UNDER_PRICE)
    - `activation_price` - Price level for activation
    - `activation_timeframe` - Timeframe for evaluation (1H_CLOSE, 4H_CLOSE, DAILY_CLOSE, INTRABAR)
    - `activation_status` - Current status (draft, published_inactive, active, completed_success, completed_fail, cancelled, expired)
    - `activated_at` - When analysis became active
    - `activation_met_at` - When condition was first met
    - `activation_notes` - Optional notes
    - `preactivation_stop_touched` - Flag if stop was touched before activation
    - `preactivation_stop_touched_at` - When pre-activation stop was touched
    - `last_eval_price` - Last evaluated price for PASSING_PRICE detection
    - `last_eval_at` - Last evaluation timestamp

  2. New Table
    - `analysis_events` - Audit log for all analysis events

  3. Security
    - Enable RLS on analysis_events
    - Add policies for viewing events
    - Add indexes for performance

  4. Notes
    - Analysis is NOT considered failed if stoploss hit before activation
    - Once activated, normal target/stoploss rules apply
    - Supports multiple timeframe evaluations
*/

-- Add activation columns to analyses table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_enabled') THEN
    ALTER TABLE analyses ADD COLUMN activation_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_type') THEN
    ALTER TABLE analyses ADD COLUMN activation_type text CHECK (activation_type IN ('PASSING_PRICE', 'ABOVE_PRICE', 'UNDER_PRICE'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_price') THEN
    ALTER TABLE analyses ADD COLUMN activation_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_timeframe') THEN
    ALTER TABLE analyses ADD COLUMN activation_timeframe text CHECK (activation_timeframe IN ('INTRABAR', '1H_CLOSE', '4H_CLOSE', 'DAILY_CLOSE')) DEFAULT 'INTRABAR';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_status') THEN
    ALTER TABLE analyses ADD COLUMN activation_status text CHECK (activation_status IN ('draft', 'published_inactive', 'active', 'completed_success', 'completed_fail', 'cancelled', 'expired')) DEFAULT 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activated_at') THEN
    ALTER TABLE analyses ADD COLUMN activated_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_met_at') THEN
    ALTER TABLE analyses ADD COLUMN activation_met_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'activation_notes') THEN
    ALTER TABLE analyses ADD COLUMN activation_notes text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'preactivation_stop_touched') THEN
    ALTER TABLE analyses ADD COLUMN preactivation_stop_touched boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'preactivation_stop_touched_at') THEN
    ALTER TABLE analyses ADD COLUMN preactivation_stop_touched_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'last_eval_price') THEN
    ALTER TABLE analyses ADD COLUMN last_eval_price numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'last_eval_at') THEN
    ALTER TABLE analyses ADD COLUMN last_eval_at timestamptz;
  END IF;
END $$;

-- Create analysis_events table for audit logging
CREATE TABLE IF NOT EXISTS analysis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_analyses_activation_status ON analyses(activation_status) WHERE activation_enabled = true;
CREATE INDEX IF NOT EXISTS idx_analyses_activation_enabled_status ON analyses(activation_enabled, activation_status) WHERE activation_enabled = true;
CREATE INDEX IF NOT EXISTS idx_analysis_events_analysis_id ON analysis_events(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_events_created_at ON analysis_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_events_event_type ON analysis_events(event_type);

-- Enable RLS on analysis_events
ALTER TABLE analysis_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view events for visible analyses" ON analysis_events;
DROP POLICY IF EXISTS "Service role can insert events" ON analysis_events;
DROP POLICY IF EXISTS "Analysts can insert events for own analyses" ON analysis_events;

-- Policy: Users can view events for analyses they can view
CREATE POLICY "Users can view events for visible analyses"
  ON analysis_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_events.analysis_id
    )
  );

-- Policy: Service role can manage all events
CREATE POLICY "Service role can manage events"
  ON analysis_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Analysts can insert events for their own analyses
CREATE POLICY "Analysts can insert events for own analyses"
  ON analysis_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_events.analysis_id
      AND analyses.analyzer_id = auth.uid()
    )
  );

-- Function to log analysis events
CREATE OR REPLACE FUNCTION log_analysis_event(
  p_analysis_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO analysis_events (analysis_id, event_type, event_data, created_by)
  VALUES (p_analysis_id, p_event_type, p_event_data, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Function to activate an analysis
CREATE OR REPLACE FUNCTION activate_analysis(
  p_analysis_id uuid,
  p_activation_price numeric,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
BEGIN
  -- Get current status
  SELECT activation_status INTO v_current_status
  FROM analyses
  WHERE id = p_analysis_id;

  -- Only activate if currently inactive
  IF v_current_status != 'published_inactive' THEN
    RETURN false;
  END IF;

  -- Update analysis to active
  UPDATE analyses
  SET 
    activation_status = 'active',
    activated_at = now(),
    activation_met_at = now(),
    activation_notes = COALESCE(p_notes, activation_notes)
  WHERE id = p_analysis_id;

  -- Log activation event
  PERFORM log_analysis_event(
    p_analysis_id,
    'ACTIVATION_MET',
    jsonb_build_object(
      'activation_price', p_activation_price,
      'notes', p_notes
    )
  );

  RETURN true;
END;
$$;

-- Function to mark pre-activation stop touched
CREATE OR REPLACE FUNCTION mark_preactivation_stop_touched(
  p_analysis_id uuid,
  p_price numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only mark if currently inactive and not already marked
  UPDATE analyses
  SET 
    preactivation_stop_touched = true,
    preactivation_stop_touched_at = now()
  WHERE id = p_analysis_id
    AND activation_status = 'published_inactive'
    AND preactivation_stop_touched = false;

  IF FOUND THEN
    -- Log event
    PERFORM log_analysis_event(
      p_analysis_id,
      'STOP_TOUCHED_PREACTIVATION',
      jsonb_build_object(
        'price', p_price,
        'note', 'Stoploss touched before activation - not counted as failure'
      )
    );
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON TABLE analysis_events IS 'Audit log for all analysis lifecycle events including activation, targets, stops, etc.';
COMMENT ON COLUMN analyses.activation_enabled IS 'If true, analysis must meet activation condition before being considered active';
COMMENT ON COLUMN analyses.activation_status IS 'Current lifecycle status of the analysis';
COMMENT ON COLUMN analyses.preactivation_stop_touched IS 'True if stoploss was touched before activation (not counted as fail)';
