/*
  # Fix Finalize Analysis Success Function
  
  Remove LEFT JOIN from FOR UPDATE query to avoid the error:
  "FOR UPDATE cannot be applied to the nullable side of an outer join"
*/

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
  v_analysis_symbol_id uuid;
  v_symbol text;
  v_direction text;
  v_target_price numeric;
  v_result jsonb;
BEGIN
  -- Get analysis details without JOIN in FOR UPDATE
  SELECT 
    a.analyzer_id,
    a.status::text,
    COALESCE(a.success_counted, false),
    a.symbol_id,
    a.direction
  INTO 
    v_analysis_analyzer_id,
    v_analysis_status,
    v_analysis_success_counted,
    v_analysis_symbol_id,
    v_direction
  FROM analyses a
  WHERE a.id = p_analysis_id
  FOR UPDATE;

  IF v_analysis_analyzer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Analysis not found');
  END IF;

  -- Get symbol separately (not in FOR UPDATE)
  SELECT symbol INTO v_symbol
  FROM symbols
  WHERE id = v_analysis_symbol_id;

  -- Check if already counted
  IF v_analysis_success_counted THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already counted', 'skipped', true);
  END IF;

  -- Don't override FAILED status
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

  -- Update analyzer success stats (if profiles table has these columns)
  BEGIN
    UPDATE profiles
    SET 
      updated_at = now()
    WHERE id = v_analysis_analyzer_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to update profile stats: %', SQLERRM;
  END;

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
