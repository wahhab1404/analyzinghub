/*
  # Add Analyzer Success Metrics

  ## Overview
  Adds functionality to track and calculate analyzer success rates based on completed analyses.

  ## New Functions

  ### get_analyzer_stats
  Calculates comprehensive statistics for an analyzer including:
  - Total analyses count
  - Active analyses count
  - Completed analyses (target_hit + stop_hit)
  - Success count (target_hit only)
  - Success rate percentage
  - Follower count
  - Following count

  ## Success Rate Calculation
  Success rate = (analyses with target_hit / completed analyses) * 100
  Completed analyses = analyses with status 'target_hit' OR 'stop_hit'
  Only includes completed analyses in the calculation to provide accurate metrics

  ## Usage
  SELECT * FROM get_analyzer_stats('user_id_here');
*/

-- Function to get comprehensive analyzer statistics
CREATE OR REPLACE FUNCTION get_analyzer_stats(analyzer_user_id uuid)
RETURNS TABLE (
  total_analyses bigint,
  active_analyses bigint,
  completed_analyses bigint,
  successful_analyses bigint,
  success_rate numeric,
  followers_count bigint,
  following_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Total analyses
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id),
    -- Active analyses
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'active'),
    -- Completed analyses (either hit target or stop)
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('target_hit', 'stop_hit')),
    -- Successful analyses (hit target)
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'target_hit'),
    -- Success rate calculation
    CASE 
      WHEN (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('target_hit', 'stop_hit')) > 0
      THEN ROUND(
        (SELECT COUNT(*)::numeric FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'target_hit') * 100.0 /
        (SELECT COUNT(*)::numeric FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('target_hit', 'stop_hit')),
        2
      )
      ELSE 0
    END,
    -- Followers count
    (SELECT COUNT(*) FROM follows WHERE following_id = analyzer_user_id),
    -- Following count
    (SELECT COUNT(*) FROM follows WHERE follower_id = analyzer_user_id);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_analyzer_stats(uuid) TO authenticated;
