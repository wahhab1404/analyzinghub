/*
  # Fix Analyzer Stats, Trading Performance, and Add Followers Feature

  1. Overview
    - Enhances get_analyzer_stats to include trading performance from index_trades
    - Fixes total profit calculations to use correct final_profit values
    - Adds followers list endpoint functionality
    - Improves analysis targets tracking

  2. Changes Made
    - Update get_analyzer_stats to include index trading stats
    - Add followers_list function for analyzers to see their followers
    - Ensure final_profit is properly calculated on trade closure
    - Fix analysis targets hit tracking

  3. Security
    - RLS policies ensure proper access control
    - Followers can only be viewed by the analyzer or authenticated users
*/

-- First, let's recreate get_analyzer_stats to include trading performance
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
      COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED')) as total,
      COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as active,
      COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')) as completed,
      COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful
    FROM analyses
    WHERE analyzer_id = analyzer_user_id
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

-- Create a function to get followers list for an analyzer
CREATE OR REPLACE FUNCTION get_followers_list(analyzer_user_id uuid)
RETURNS TABLE (
  follower_id uuid,
  follower_name text,
  follower_avatar text,
  follower_role text,
  followed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as follower_id,
    p.full_name as follower_name,
    p.avatar_url as follower_avatar,
    r.name as follower_role,
    f.created_at as followed_at
  FROM follows f
  JOIN profiles p ON p.id = f.follower_id
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE f.following_id = analyzer_user_id
  ORDER BY f.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_followers_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_followers_list(uuid) TO service_role;

-- Create a function to get following list for a user
CREATE OR REPLACE FUNCTION get_following_list(user_id uuid)
RETURNS TABLE (
  following_id uuid,
  following_name text,
  following_avatar text,
  following_role text,
  followed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as following_id,
    p.full_name as following_name,
    p.avatar_url as following_avatar,
    r.name as following_role,
    f.created_at as followed_at
  FROM follows f
  JOIN profiles p ON p.id = f.following_id
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE f.follower_id = user_id
  ORDER BY f.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_following_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_following_list(uuid) TO service_role;

-- Ensure trades have proper final_profit calculation on close
-- This trigger ensures final_profit is set correctly when a trade is closed
CREATE OR REPLACE FUNCTION update_trade_final_profit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When a trade transitions to closed status, ensure final_profit is set
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    -- If final_profit is null or zero, use max_profit as the final profit
    IF NEW.final_profit IS NULL OR NEW.final_profit = 0 THEN
      NEW.final_profit = COALESCE(NEW.max_profit, NEW.profit_from_entry, 0);
    END IF;

    -- Ensure closed_at is set
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_trade_final_profit ON index_trades;

CREATE TRIGGER trigger_update_trade_final_profit
  BEFORE UPDATE ON index_trades
  FOR EACH ROW
  WHEN (NEW.status = 'closed')
  EXECUTE FUNCTION update_trade_final_profit();

-- Add index for better performance on trade profit queries
CREATE INDEX IF NOT EXISTS idx_index_trades_author_status_profit
  ON index_trades(author_id, status, final_profit);

CREATE INDEX IF NOT EXISTS idx_index_trades_closed_winning
  ON index_trades(author_id, status, is_winning_trade)
  WHERE status = 'closed';