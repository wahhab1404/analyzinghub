/*
  # Fix Analyzer Stats Function

  ## Overview
  Updates the get_analyzer_stats function to use correct status values.
  
  ## Changes
  - Fix status checks to use 'IN_PROGRESS', 'SUCCESS', 'FAILED' instead of incorrect values
  - Align with the actual analysis_status ENUM type

  ## Status Values
  - IN_PROGRESS: Active analyses
  - SUCCESS: Successfully completed (target hit)
  - FAILED: Failed (stop loss hit)
*/

-- Drop and recreate the function with correct status values
DROP FUNCTION IF EXISTS get_analyzer_stats(uuid);

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
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'IN_PROGRESS'),
    -- Completed analyses (either success or failed)
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('SUCCESS', 'FAILED')),
    -- Successful analyses (hit target)
    (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'SUCCESS'),
    -- Success rate calculation
    CASE 
      WHEN (SELECT COUNT(*) FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('SUCCESS', 'FAILED')) > 0
      THEN ROUND(
        (SELECT COUNT(*)::numeric FROM analyses WHERE analyzer_id = analyzer_user_id AND status = 'SUCCESS') * 100.0 /
        (SELECT COUNT(*)::numeric FROM analyses WHERE analyzer_id = analyzer_user_id AND status IN ('SUCCESS', 'FAILED')),
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
