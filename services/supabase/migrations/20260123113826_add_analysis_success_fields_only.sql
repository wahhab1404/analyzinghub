/*
  # Add Analysis Success Tracking Fields

  1. New Fields to analyses table
    - `success_at` (timestamptz) - when analysis became successful
    - `success_reason` (text) - why it succeeded (TARGET_HIT, etc.)
    - `first_hit_target_id` (uuid) - which target was hit first
    - `success_counted` (boolean) - prevents double counting points
    
  2. New Indexes
    - Index on success_at for filtering successful analyses
*/

-- Add success tracking fields to analyses table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'success_at'
  ) THEN
    ALTER TABLE analyses ADD COLUMN success_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'success_reason'
  ) THEN
    ALTER TABLE analyses ADD COLUMN success_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'first_hit_target_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN first_hit_target_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'success_counted'
  ) THEN
    ALTER TABLE analyses ADD COLUMN success_counted boolean DEFAULT false;
  END IF;
END $$;

-- Create index for filtering successful analyses
CREATE INDEX IF NOT EXISTS idx_analyses_success_at 
  ON analyses(success_at) WHERE success_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_success_counted 
  ON analyses(success_counted) WHERE success_counted = true;

-- Create function to finalize analysis success
CREATE OR REPLACE FUNCTION finalize_analysis_success(
  p_analysis_id uuid,
  p_target_id uuid,
  p_hit_price numeric,
  p_hit_session text DEFAULT 'unknown',
  p_hit_source text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_analysis_analyzer_id uuid;
  v_analysis_status text;
  v_analysis_success_counted boolean;
  v_symbol text;
  v_direction text;
  v_target_price numeric;
  v_result jsonb;
BEGIN
  -- Get analysis details with explicit column selection
  SELECT 
    a.analyzer_id,
    a.status::text,
    COALESCE(a.success_counted, false),
    s.symbol,
    a.direction
  INTO 
    v_analysis_analyzer_id,
    v_analysis_status,
    v_analysis_success_counted,
    v_symbol,
    v_direction
  FROM analyses a
  LEFT JOIN symbols s ON s.id = a.symbol_id
  WHERE a.id = p_analysis_id
  FOR UPDATE;

  IF v_analysis_analyzer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Analysis not found');
  END IF;

  -- Check if already counted
  IF v_analysis_success_counted THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already counted', 'skipped', true);
  END IF;

  -- Don't override FAILED status (stoploss hit first)
  IF v_analysis_status = 'FAILED' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Analysis already failed', 'skipped', true);
  END IF;

  -- Get target price
  SELECT price INTO v_target_price
  FROM analysis_targets
  WHERE id = p_target_id;

  -- Update analysis status
  UPDATE analyses
  SET 
    status = 'SUCCESS',
    success_at = now(),
    success_reason = 'TARGET_HIT',
    first_hit_target_id = p_target_id,
    success_counted = true,
    updated_at = now()
  WHERE id = p_analysis_id;

  -- Award points for analysis success
  BEGIN
    PERFORM award_points_for_event(
      p_analyzer_id := v_analysis_analyzer_id,
      p_event_type := 'analysis_success',
      p_reference_type := 'analysis',
      p_reference_id := p_analysis_id,
      p_metadata := jsonb_build_object(
        'symbol', v_symbol,
        'direction', v_direction,
        'target_price', v_target_price,
        'hit_price', p_hit_price
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to award points: %', SQLERRM;
  END;

  -- Update analyzer success stats
  UPDATE profiles
  SET 
    successful_analyses = COALESCE(successful_analyses, 0) + 1,
    total_analyses = COALESCE(total_analyses, 0) + 1,
    updated_at = now()
  WHERE id = v_analysis_analyzer_id;

  v_result := jsonb_build_object(
    'success', true,
    'analysis_id', p_analysis_id,
    'analyzer_id', v_analysis_analyzer_id,
    'target_id', p_target_id,
    'hit_price', p_hit_price,
    'symbol', v_symbol,
    'direction', v_direction
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION finalize_analysis_success TO service_role;

-- Create function to get analysis status display info
CREATE OR REPLACE FUNCTION get_analysis_status_display(p_status text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_status
    WHEN 'SUCCESS' THEN jsonb_build_object(
      'badgeText', 'Successful',
      'styleClass', 'success',
      'color', 'green',
      'borderClass', 'border-l-4 border-green-500',
      'bgClass', 'bg-green-50',
      'textClass', 'text-green-700'
    )
    WHEN 'FAILED' THEN jsonb_build_object(
      'badgeText', 'Failed',
      'styleClass', 'failed',
      'color', 'red',
      'borderClass', 'border-l-4 border-red-500',
      'bgClass', 'bg-red-50',
      'textClass', 'text-red-700'
    )
    WHEN 'IN_PROGRESS' THEN jsonb_build_object(
      'badgeText', 'Active',
      'styleClass', 'active',
      'color', 'blue',
      'borderClass', 'border-l-4 border-blue-500',
      'bgClass', 'bg-blue-50',
      'textClass', 'text-blue-700'
    )
    WHEN 'PENDING' THEN jsonb_build_object(
      'badgeText', 'Pending',
      'styleClass', 'pending',
      'color', 'gray',
      'borderClass', 'border-l-4 border-gray-500',
      'bgClass', 'bg-gray-50',
      'textClass', 'text-gray-700'
    )
    ELSE jsonb_build_object(
      'badgeText', 'Unknown',
      'styleClass', 'unknown',
      'color', 'gray',
      'borderClass', 'border-l-4 border-gray-300',
      'bgClass', 'bg-gray-50',
      'textClass', 'text-gray-600'
    )
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_analysis_status_display TO authenticated, anon, service_role;
