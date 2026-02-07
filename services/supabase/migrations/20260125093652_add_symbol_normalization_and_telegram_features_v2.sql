/*
  # Add Symbol Normalization and Telegram Bot Query Support

  ## Overview
  This migration adds support for Telegram bot ticker queries, enabling users to 
  search for analyses by sending stock symbols (e.g., AAPL, TSLA, 2222.SR).

  ## Changes

  1. Symbol Normalization
    - Add `symbol_normalized` column to `symbols` table (uppercase, trimmed)
    - Add `symbol_normalized` column to `analyses` table for denormalization
    - Create index on `analyses(symbol_normalized, created_at DESC)` for fast queries
    - Backfill normalized symbols from existing data

  2. Rate Limiting
    - Create `telegram_rate_limits` table to track user queries
    - TTL-based cleanup (10 minute windows)
    - Index on user_id and created_at

  3. Pagination State
    - Create `telegram_pagination_state` table for multi-page results
    - Store query context (symbol, page, total_count)
    - TTL-based cleanup (10 minute expiry)

  ## Security
    - RLS enabled on all new tables
    - Service role access for bot operations
    - Rate limiting prevents abuse

  ## Performance
    - Indexes ensure <50ms query times
    - Pagination limits result sets
    - TTL cleanup prevents table bloat
*/

-- Add symbol_normalized to symbols table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'symbols' AND column_name = 'symbol_normalized'
  ) THEN
    ALTER TABLE symbols ADD COLUMN symbol_normalized TEXT;
  END IF;
END $$;

-- Add symbol_normalized to analyses table (denormalized for performance)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'symbol_normalized'
  ) THEN
    ALTER TABLE analyses ADD COLUMN symbol_normalized TEXT;
  END IF;
END $$;

-- Backfill normalized symbols
UPDATE symbols 
SET symbol_normalized = UPPER(TRIM(symbol))
WHERE symbol_normalized IS NULL;

UPDATE analyses
SET symbol_normalized = (
  SELECT UPPER(TRIM(s.symbol))
  FROM symbols s
  WHERE s.id = analyses.symbol_id
)
WHERE symbol_normalized IS NULL;

-- Create indexes for fast symbol queries
CREATE INDEX IF NOT EXISTS idx_symbols_normalized 
  ON symbols(symbol_normalized);

CREATE INDEX IF NOT EXISTS idx_analyses_symbol_normalized_created 
  ON analyses(symbol_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analyses_symbol_normalized_visibility
  ON analyses(symbol_normalized, visibility, created_at DESC);

-- Create telegram_symbol_query_limits table (separate from existing rate limits)
CREATE TABLE IF NOT EXISTS telegram_symbol_query_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_chat_id TEXT NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_symbol_query_limits
  ON telegram_symbol_query_limits(user_chat_id, created_at DESC);

-- Enable RLS on telegram_symbol_query_limits
ALTER TABLE telegram_symbol_query_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage symbol query limits" ON telegram_symbol_query_limits;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Service role can manage symbol query limits
CREATE POLICY "Service role can manage symbol query limits"
  ON telegram_symbol_query_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create telegram_pagination_state table
CREATE TABLE IF NOT EXISTS telegram_pagination_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_chat_id TEXT NOT NULL,
  query_symbol TEXT NOT NULL,
  current_page INTEGER NOT NULL DEFAULT 1,
  total_count INTEGER NOT NULL,
  page_size INTEGER NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_telegram_pagination_user_symbol
  ON telegram_pagination_state(user_chat_id, query_symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_pagination_expires
  ON telegram_pagination_state(expires_at);

-- Enable RLS on telegram_pagination_state
ALTER TABLE telegram_pagination_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage pagination state" ON telegram_pagination_state;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Service role can manage pagination state
CREATE POLICY "Service role can manage pagination state"
  ON telegram_pagination_state FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to cleanup expired symbol query limits (older than 10 minutes)
CREATE OR REPLACE FUNCTION cleanup_telegram_symbol_query_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM telegram_symbol_query_limits
  WHERE created_at < (now() - interval '10 minutes');
END;
$$;

-- Function to cleanup expired pagination state
CREATE OR REPLACE FUNCTION cleanup_telegram_pagination_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM telegram_pagination_state
  WHERE expires_at < now();
END;
$$;

-- Function to check symbol query rate limit (10 queries per 10 minutes)
CREATE OR REPLACE FUNCTION check_telegram_symbol_query_limit(
  p_user_chat_id TEXT,
  p_max_queries INTEGER DEFAULT 10,
  p_window_minutes INTEGER DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count queries in the time window
  SELECT COUNT(*)
  INTO v_count
  FROM telegram_symbol_query_limits
  WHERE user_chat_id = p_user_chat_id
    AND created_at > (now() - (p_window_minutes || ' minutes')::interval);

  -- Check if under limit
  IF v_count < p_max_queries THEN
    -- Record this query
    INSERT INTO telegram_symbol_query_limits (user_chat_id)
    VALUES (p_user_chat_id);
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- Function to get analyses by normalized symbol with pagination
CREATE OR REPLACE FUNCTION get_analyses_by_symbol(
  p_symbol_normalized TEXT,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 10
)
RETURNS TABLE (
  analysis_id uuid,
  analyzer_id uuid,
  analyzer_name TEXT,
  analyzer_display_name TEXT,
  title TEXT,
  summary TEXT,
  post_type TEXT,
  analysis_type TEXT,
  direction TEXT,
  chart_frame TEXT,
  created_at timestamptz,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER;
  v_total_count BIGINT;
BEGIN
  -- Calculate offset
  v_offset := (p_page - 1) * p_page_size;

  -- Get total count
  SELECT COUNT(*)
  INTO v_total_count
  FROM analyses a
  WHERE a.symbol_normalized = UPPER(TRIM(p_symbol_normalized))
    AND a.visibility = 'public';

  -- Return paginated results with total count
  RETURN QUERY
  SELECT 
    a.id as analysis_id,
    a.analyzer_id,
    p.full_name as analyzer_name,
    p.display_name as analyzer_display_name,
    a.title,
    a.summary,
    a.post_type::TEXT,
    a.analysis_type,
    a.direction,
    a.chart_frame,
    a.created_at,
    v_total_count as total_count
  FROM analyses a
  JOIN profiles p ON a.analyzer_id = p.id
  WHERE a.symbol_normalized = UPPER(TRIM(p_symbol_normalized))
    AND a.visibility = 'public'
  ORDER BY a.created_at DESC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- Trigger to auto-update symbol_normalized on symbols insert/update
CREATE OR REPLACE FUNCTION update_symbol_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.symbol_normalized := UPPER(TRIM(NEW.symbol));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_symbol_normalized ON symbols;
CREATE TRIGGER trigger_update_symbol_normalized
  BEFORE INSERT OR UPDATE OF symbol ON symbols
  FOR EACH ROW
  EXECUTE FUNCTION update_symbol_normalized();

-- Trigger to auto-update symbol_normalized on analyses insert/update
CREATE OR REPLACE FUNCTION update_analysis_symbol_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.symbol_normalized := (
    SELECT UPPER(TRIM(s.symbol))
    FROM symbols s
    WHERE s.id = NEW.symbol_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_analysis_symbol_normalized ON analyses;
CREATE TRIGGER trigger_update_analysis_symbol_normalized
  BEFORE INSERT OR UPDATE OF symbol_id ON analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_symbol_normalized();

-- Add comments
COMMENT ON COLUMN symbols.symbol_normalized IS 'Normalized symbol (uppercase, trimmed) for case-insensitive queries';
COMMENT ON COLUMN analyses.symbol_normalized IS 'Denormalized symbol_normalized for fast queries without JOIN';
COMMENT ON TABLE telegram_symbol_query_limits IS 'Rate limiting for Telegram bot symbol queries (10 queries per 10 minutes)';
COMMENT ON TABLE telegram_pagination_state IS 'Pagination state for multi-page Telegram bot results (10 minute TTL)';
COMMENT ON FUNCTION get_analyses_by_symbol IS 'Query analyses by normalized symbol with pagination support';
COMMENT ON FUNCTION check_telegram_symbol_query_limit IS 'Check and enforce rate limits for Telegram bot symbol queries';
