/*
  # Create Options Chain Cache Table

  1. New Table
    - `options_chain_cache`
      - `cache_key` (text, primary key) - Unique cache identifier
      - `data` (jsonb) - Cached options chain data
      - `created_at` (timestamptz) - Cache creation time
      - `expires_at` (timestamptz) - Cache expiration time

  2. Indexes
    - Index on `expires_at` for efficient cleanup
    - Index on `cache_key` pattern for clearing by underlying

  3. Security
    - Only service role can access cache table (server-side only)

  4. Notes
    - TTL-based caching for Polygon options data
    - Reduces API calls and improves response times
    - Automatic expiration via expires_at timestamp
*/

-- Create options chain cache table
CREATE TABLE IF NOT EXISTS options_chain_cache (
  cache_key text PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_options_chain_cache_expires_at
  ON options_chain_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_options_chain_cache_key_pattern
  ON options_chain_cache (cache_key text_pattern_ops);

-- Enable Row Level Security
ALTER TABLE options_chain_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (server-side only)
CREATE POLICY "Service role full access to options cache"
  ON options_chain_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE options_chain_cache IS
  'Cache for Polygon options chain data with TTL-based expiration';
