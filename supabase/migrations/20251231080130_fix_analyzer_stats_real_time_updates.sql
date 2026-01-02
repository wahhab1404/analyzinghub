/*
  # Fix Analyzer Stats Real-Time Updates

  1. Overview
    Fixes the issue where summary performance stats don't update in real-time.
    Improves the get_analyzer_stats function and ensures it returns fresh data.

  2. Changes
    - Recreate get_analyzer_stats function with optimized queries
    - Add proper indexing for performance
    - Ensure stats reflect latest data from analyses table

  3. Performance Improvements
    - Use single query instead of multiple subqueries
    - Add indexes for faster aggregation
    - Mark function as VOLATILE to prevent caching of stale data
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_analyzer_stats(uuid);

-- Recreate with optimized query and VOLATILE to prevent caching
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
VOLATILE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH analysis_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED')) as total,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as active,
      COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')) as completed,
      COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful
    FROM analyses 
    WHERE analyzer_id = analyzer_user_id
  ),
  follow_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE following_id = analyzer_user_id) as followers,
      COUNT(*) FILTER (WHERE follower_id = analyzer_user_id) as following
    FROM follows
    WHERE following_id = analyzer_user_id OR follower_id = analyzer_user_id
  )
  SELECT 
    COALESCE(a.total, 0)::bigint as total_analyses,
    COALESCE(a.active, 0)::bigint as active_analyses,
    COALESCE(a.completed, 0)::bigint as completed_analyses,
    COALESCE(a.successful, 0)::bigint as successful_analyses,
    CASE 
      WHEN COALESCE(a.completed, 0) > 0 
      THEN ROUND((COALESCE(a.successful, 0)::numeric * 100.0) / COALESCE(a.completed, 1)::numeric, 2)
      ELSE 0::numeric
    END as success_rate,
    COALESCE(f.followers, 0)::bigint as followers_count,
    COALESCE(f.following, 0)::bigint as following_count
  FROM analysis_stats a
  CROSS JOIN follow_stats f;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_analyzer_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analyzer_stats(uuid) TO service_role;

-- Add composite index for better performance on analysis stats queries
CREATE INDEX IF NOT EXISTS idx_analyses_analyzer_status 
  ON analyses(analyzer_id, status);

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_analyses_status 
  ON analyses(status) 
  WHERE status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED');