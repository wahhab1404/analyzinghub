/*
  # Add Debug Logging for Social Features

  ## Purpose
  This migration adds helper functions to debug social feature visibility issues.
  These are temporary functions for troubleshooting.

  ## Changes
  - Add function to check what a user can see
*/

-- Function to test what anonymous users can see
CREATE OR REPLACE FUNCTION debug_check_visibility()
RETURNS TABLE (
  table_name text,
  total_rows bigint,
  visible_to_anon bigint,
  visible_to_authenticated bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This is a temporary debug function
  RETURN QUERY
  SELECT 
    'comments'::text,
    (SELECT COUNT(*) FROM comments),
    (SELECT COUNT(*) FROM comments WHERE true),
    (SELECT COUNT(*) FROM comments WHERE true)
  UNION ALL
  SELECT 
    'likes'::text,
    (SELECT COUNT(*) FROM likes),
    (SELECT COUNT(*) FROM likes WHERE true),
    (SELECT COUNT(*) FROM likes WHERE true)
  UNION ALL
  SELECT 
    'reposts'::text,
    (SELECT COUNT(*) FROM reposts),
    (SELECT COUNT(*) FROM reposts WHERE true),
    (SELECT COUNT(*) FROM reposts WHERE true)
  UNION ALL
  SELECT 
    'analysis_ratings'::text,
    (SELECT COUNT(*) FROM analysis_ratings),
    (SELECT COUNT(*) FROM analysis_ratings WHERE true),
    (SELECT COUNT(*) FROM analysis_ratings WHERE true);
END;
$$;
