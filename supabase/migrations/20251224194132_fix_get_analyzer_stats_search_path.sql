/*
  # Fix get_analyzer_stats Function Search Path
  
  1. Issue
    - Previous migration attempted to set search_path with wrong parameter name
    - Function signature uses `analyzer_user_id` not `p_user_id`
    
  2. Fix
    - Correctly set search_path on the actual function signature
*/

-- Set search_path for get_analyzer_stats with correct parameter name
ALTER FUNCTION get_analyzer_stats(analyzer_user_id uuid) 
  SET search_path = public;
