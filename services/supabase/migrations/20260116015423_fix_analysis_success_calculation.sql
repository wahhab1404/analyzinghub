/*
  # Fix Analysis Success Rate Calculation

  1. Problem
    - Success rate should be based on validation_events (TARGET_HIT) for stock analyses
    - Current implementation only looks at status = 'SUCCESS'
    - Need to properly count analyses that hit their targets

  2. Solution
    - Update get_analyzer_stats to count successful analyses properly
    - An analysis is successful if it has at least one TARGET_HIT validation event
    - Count completed analyses as those with validation events or marked as complete

  3. Notes
    - For stock analyses: SUCCESS = at least one target hit
    - For index analyses: Use existing trade win logic
*/

DROP FUNCTION IF EXISTS get_analyzer_stats(uuid);

CREATE OR REPLACE FUNCTION get_analyzer_stats(analyzer_user_id uuid)
RETURNS TABLE (
  total_analyses bigint,
  active_analyses bigint,
  completed_analyses bigint,
  successful_analyses bigint,
  success_rate numeric,
  followers_count bigint,
  following_count bigint,
  total_trades bigint,
  active_trades bigint,
  closed_trades bigint,
  winning_trades bigint,
  trade_win_rate numeric,
  total_trading_pnl numeric
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
      -- Total: All analyses (ignore drafts if any)
      COUNT(*) FILTER (
        WHERE NOT activation_enabled OR activation_status NOT IN ('draft')
      ) as total,
      -- Active: Currently being tracked
      COUNT(*) FILTER (
        WHERE 
          (NOT activation_enabled AND status = 'IN_PROGRESS')
          OR (activation_enabled AND activation_status IN ('published_inactive', 'active'))
      ) as active,
      -- Completed: Has target hits OR marked as completed status
      COUNT(DISTINCT a.id) FILTER (
        WHERE 
          EXISTS (
            SELECT 1 FROM validation_events ve 
            WHERE ve.analysis_id = a.id 
            AND ve.event_type = 'TARGET_HIT'
          )
          OR a.status IN ('SUCCESS', 'FAILED')
          OR (activation_enabled AND activation_status IN ('completed_success', 'completed_fail', 'expired'))
      ) as completed,
      -- Successful: Has at least one target hit OR marked as SUCCESS
      COUNT(DISTINCT a.id) FILTER (
        WHERE 
          EXISTS (
            SELECT 1 FROM validation_events ve 
            WHERE ve.analysis_id = a.id 
            AND ve.event_type = 'TARGET_HIT'
          )
          OR a.status = 'SUCCESS'
          OR (activation_enabled AND activation_status = 'completed_success')
      ) as successful
    FROM analyses a
    WHERE a.analyzer_id = analyzer_user_id
  ),
  trading_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'closed') as closed,
      COUNT(*) FILTER (WHERE status = 'closed' AND is_winning_trade = true) as winning,
      COALESCE(SUM(CASE WHEN status = 'closed' THEN COALESCE(final_profit, max_profit, 0) ELSE 0 END), 0) as total_pnl
    FROM index_trades
    WHERE author_id = analyzer_user_id
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
    COALESCE(f.following, 0)::bigint as following_count,
    COALESCE(t.total, 0)::bigint as total_trades,
    COALESCE(t.active, 0)::bigint as active_trades,
    COALESCE(t.closed, 0)::bigint as closed_trades,
    COALESCE(t.winning, 0)::bigint as winning_trades,
    CASE
      WHEN COALESCE(t.closed, 0) > 0
      THEN ROUND((COALESCE(t.winning, 0)::numeric * 100.0) / COALESCE(t.closed, 1)::numeric, 2)
      ELSE 0::numeric
    END as trade_win_rate,
    COALESCE(t.total_pnl, 0)::numeric as total_trading_pnl
  FROM analysis_stats a
  CROSS JOIN follow_stats f
  CROSS JOIN trading_stats t;
END;
$$;

GRANT EXECUTE ON FUNCTION get_analyzer_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analyzer_stats(uuid) TO service_role;

-- Add helpful index for validation_events lookup
CREATE INDEX IF NOT EXISTS idx_validation_events_analysis_event_type
  ON validation_events(analysis_id, event_type)
  WHERE event_type = 'TARGET_HIT';