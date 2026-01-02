/*
  # Ranking and Reputation System for AnalyzingHub

  ## Overview
  Transparent, auditable points and badge system for analysts and traders.
  Rewards accuracy (analysts) and quality engagement (traders) while preventing gaming.

  ## New Tables

  ### `user_points_ledger`
  Immutable log of all point-generating events (source of truth)
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, FK to profiles) - User earning/losing points
  - `role` (text) - 'analyst' or 'trader'
  - `event_type` (text) - Type of event (analysis_created, target_hit, stop_hit, like, etc.)
  - `entity_type` (text) - Type of entity (analysis, comment, symbol, user)
  - `entity_id` (uuid) - ID of the entity
  - `points_delta` (int) - Points change (positive or negative)
  - `metadata` (jsonb) - Additional context (symbol, targetIndex, etc.)
  - `created_at` (timestamptz) - Event timestamp
  - Unique constraint on (user_id, event_type, entity_id) for idempotency

  ### `user_points_balance`
  Cached point totals for fast access
  - `user_id` (uuid, PK, FK to profiles) - User
  - `analyst_points_all_time` (int) - Total analyst points
  - `trader_points_all_time` (int) - Total trader points
  - `analyst_points_weekly` (int) - Points this week
  - `trader_points_weekly` (int) - Points this week
  - `analyst_points_monthly` (int) - Points this month
  - `trader_points_monthly` (int) - Points this month
  - `last_updated_at` (timestamptz) - Last update

  ### `user_badges`
  Badge awards and revocations
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, FK to profiles) - Badge holder
  - `badge_key` (text) - Badge identifier
  - `badge_name` (text) - Display name
  - `badge_tier` (text) - Badge tier (bronze, silver, gold, platinum)
  - `awarded_at` (timestamptz) - Award timestamp
  - `revoked_at` (timestamptz, nullable) - Revocation timestamp
  - `metadata` (jsonb) - Badge criteria met
  - Unique constraint on (user_id, badge_key) where revoked_at is null

  ### `user_stats`
  Cached statistics for badge calculations
  - `user_id` (uuid, PK, FK to profiles) - User
  - `closed_analyses` (int) - Total closed analyses
  - `successful_analyses` (int) - Analyses that hit at least one target
  - `failed_analyses` (int) - Analyses that hit stop loss
  - `win_rate` (decimal) - Success percentage
  - `consecutive_stops` (int) - Current consecutive stop losses
  - `target_hits_last_30_days` (int) - Recent target hits
  - `total_ratings_given` (int) - Ratings submitted
  - `accurate_ratings` (int) - Ratings matching outcome
  - `rating_accuracy` (decimal) - Rating accuracy percentage
  - `total_reposts` (int) - Reposts count
  - `successful_reposts` (int) - Reposts of successful analyses
  - `unique_analysts_followed` (int) - Distinct analysts followed
  - `unique_symbols_interacted` (int) - Distinct symbols
  - `account_created_at` (timestamptz) - Account age
  - `last_active_at` (timestamptz) - Last activity
  - `is_email_verified` (boolean) - Email verification status
  - `last_calculated_at` (timestamptz) - Last stats update

  ### `leaderboard_cache`
  Pre-computed leaderboard data for fast access
  - `id` (uuid, primary key) - Unique identifier
  - `scope` (text) - 'weekly', 'monthly', 'all_time'
  - `type` (text) - 'analyst' or 'trader'
  - `rank` (int) - Position in leaderboard
  - `user_id` (uuid, FK to profiles) - User
  - `points` (int) - Points for this scope
  - `quality_score` (decimal) - Optional quality multiplier
  - `metadata` (jsonb) - Additional stats for display
  - `generated_at` (timestamptz) - Cache generation time
  - Unique constraint on (scope, type, user_id)

  ### `suspicious_activity_log`
  Track potential gaming behavior
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, FK to profiles) - Suspicious user
  - `activity_type` (text) - Type of suspicious behavior
  - `details` (jsonb) - Activity details
  - `flagged_at` (timestamptz) - Flag timestamp
  - `reviewed_at` (timestamptz, nullable) - Review timestamp
  - `action_taken` (text, nullable) - Action if any

  ### `daily_points_cap`
  Track daily point accumulation for caps
  - `user_id` (uuid) - User
  - `date` (date) - Date
  - `trader_points_today` (int) - Trader points earned today
  - `analyst_analyses_today` (int) - Analyses published today
  - Unique constraint on (user_id, date)

  ## Security
  - All tables have RLS enabled
  - Ledger: Service role only for writes
  - Balances/Stats: Users can view their own
  - Leaderboards: Public read
  - Badges: Public read

  ## Indexes
  - Ledger: user_id, event_type, entity_id, created_at
  - Stats: win_rate, rating_accuracy (for badge queries)
  - Leaderboard: scope, type, rank
  - Daily caps: user_id, date
*/

-- Create enum types
DO $$ BEGIN
  CREATE TYPE scoring_event_type AS ENUM (
    'analysis_created',
    'target_hit',
    'stop_hit',
    'like',
    'bookmark',
    'repost',
    'comment',
    'rating',
    'helpful_vote',
    'unhelpful_vote'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE badge_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_points_ledger table
CREATE TABLE IF NOT EXISTS user_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('analyst', 'trader')),
  event_type scoring_event_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('analysis', 'comment', 'symbol', 'user', 'target')),
  entity_id uuid NOT NULL,
  points_delta int NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint for idempotency (per event type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_idempotency 
ON user_points_ledger(user_id, event_type, entity_id, (metadata->>'targetIndex'))
WHERE event_type NOT IN ('comment', 'helpful_vote', 'unhelpful_vote');

-- Create user_points_balance table
CREATE TABLE IF NOT EXISTS user_points_balance (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  analyst_points_all_time int DEFAULT 0,
  trader_points_all_time int DEFAULT 0,
  analyst_points_weekly int DEFAULT 0,
  trader_points_weekly int DEFAULT 0,
  analyst_points_monthly int DEFAULT 0,
  trader_points_monthly int DEFAULT 0,
  last_updated_at timestamptz DEFAULT now()
);

-- Create user_badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  badge_name text NOT NULL,
  badge_tier badge_tier NOT NULL,
  awarded_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_active
ON user_badges(user_id, badge_key)
WHERE revoked_at IS NULL;

-- Create user_stats table
CREATE TABLE IF NOT EXISTS user_stats (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  closed_analyses int DEFAULT 0,
  successful_analyses int DEFAULT 0,
  failed_analyses int DEFAULT 0,
  win_rate numeric(5,2) DEFAULT 0,
  consecutive_stops int DEFAULT 0,
  target_hits_last_30_days int DEFAULT 0,
  total_ratings_given int DEFAULT 0,
  accurate_ratings int DEFAULT 0,
  rating_accuracy numeric(5,2) DEFAULT 0,
  total_reposts int DEFAULT 0,
  successful_reposts int DEFAULT 0,
  unique_analysts_followed int DEFAULT 0,
  unique_symbols_interacted int DEFAULT 0,
  account_created_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  is_email_verified boolean DEFAULT false,
  last_calculated_at timestamptz DEFAULT now()
);

-- Create leaderboard_cache table
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('weekly', 'monthly', 'all_time')),
  type text NOT NULL CHECK (type IN ('analyst', 'trader')),
  rank int NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points int NOT NULL,
  quality_score numeric(5,2) DEFAULT 1.0,
  metadata jsonb DEFAULT '{}'::jsonb,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(scope, type, user_id)
);

-- Create suspicious_activity_log table
CREATE TABLE IF NOT EXISTS suspicious_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  flagged_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  action_taken text
);

-- Create daily_points_cap table
CREATE TABLE IF NOT EXISTS daily_points_cap (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  trader_points_today int DEFAULT 0,
  analyst_analyses_today int DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON user_points_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_event_type ON user_points_ledger(event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON user_points_ledger(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON user_points_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_role_points ON user_points_ledger(role, points_delta);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_badges_key ON user_badges(badge_key);

CREATE INDEX IF NOT EXISTS idx_user_stats_win_rate ON user_stats(win_rate DESC) WHERE closed_analyses >= 20;
CREATE INDEX IF NOT EXISTS idx_user_stats_rating_accuracy ON user_stats(rating_accuracy DESC) WHERE total_ratings_given >= 50;

CREATE INDEX IF NOT EXISTS idx_leaderboard_scope_type_rank ON leaderboard_cache(scope, type, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard_cache(user_id);

CREATE INDEX IF NOT EXISTS idx_suspicious_activity_user ON suspicious_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_flagged ON suspicious_activity_log(flagged_at) WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_daily_cap_date ON daily_points_cap(date);

-- Enable RLS
ALTER TABLE user_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_points_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_points_cap ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_points_ledger
CREATE POLICY "Users can view own ledger entries"
  ON user_points_ledger FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage ledger"
  ON user_points_ledger FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for user_points_balance
CREATE POLICY "Users can view own balance"
  ON user_points_balance FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone can view balances"
  ON user_points_balance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage balances"
  ON user_points_balance FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for user_badges
CREATE POLICY "Anyone can view active badges"
  ON user_badges FOR SELECT
  TO authenticated
  USING (revoked_at IS NULL);

CREATE POLICY "Service role can manage badges"
  ON user_badges FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for user_stats
CREATE POLICY "Anyone can view stats"
  ON user_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage stats"
  ON user_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for leaderboard_cache
CREATE POLICY "Anyone can view leaderboards"
  ON leaderboard_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage leaderboards"
  ON leaderboard_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for suspicious_activity_log
CREATE POLICY "Service role only for suspicious activity"
  ON suspicious_activity_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for daily_points_cap
CREATE POLICY "Service role only for daily caps"
  ON daily_points_cap FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Initialize balance for existing users
INSERT INTO user_points_balance (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- Initialize stats for existing users
INSERT INTO user_stats (user_id, account_created_at, is_email_verified)
SELECT id, created_at, true FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- Function to update points balance
CREATE OR REPLACE FUNCTION update_points_balance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update all-time points
  INSERT INTO user_points_balance (user_id, analyst_points_all_time, trader_points_all_time)
  SELECT 
    user_id,
    COALESCE(SUM(CASE WHEN role = 'analyst' THEN points_delta ELSE 0 END), 0) as analyst_points,
    COALESCE(SUM(CASE WHEN role = 'trader' THEN points_delta ELSE 0 END), 0) as trader_points
  FROM user_points_ledger
  GROUP BY user_id
  ON CONFLICT (user_id) DO UPDATE SET
    analyst_points_all_time = EXCLUDED.analyst_points_all_time,
    trader_points_all_time = EXCLUDED.trader_points_all_time,
    last_updated_at = now();

  -- Update weekly points
  UPDATE user_points_balance upb
  SET 
    analyst_points_weekly = COALESCE((
      SELECT SUM(points_delta)
      FROM user_points_ledger
      WHERE user_id = upb.user_id
      AND role = 'analyst'
      AND created_at >= now() - interval '7 days'
    ), 0),
    trader_points_weekly = COALESCE((
      SELECT SUM(points_delta)
      FROM user_points_ledger
      WHERE user_id = upb.user_id
      AND role = 'trader'
      AND created_at >= now() - interval '7 days'
    ), 0);

  -- Update monthly points
  UPDATE user_points_balance upb
  SET 
    analyst_points_monthly = COALESCE((
      SELECT SUM(points_delta)
      FROM user_points_ledger
      WHERE user_id = upb.user_id
      AND role = 'analyst'
      AND created_at >= now() - interval '30 days'
    ), 0),
    trader_points_monthly = COALESCE((
      SELECT SUM(points_delta)
      FROM user_points_ledger
      WHERE user_id = upb.user_id
      AND role = 'trader'
      AND created_at >= now() - interval '30 days'
    ), 0),
    last_updated_at = now();
END;
$$;

-- Function to calculate user statistics for badges
CREATE OR REPLACE FUNCTION calculate_user_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_analyses int;
  v_successful_analyses int;
  v_failed_analyses int;
  v_win_rate numeric;
  v_target_hits_30d int;
  v_consecutive_stops int;
BEGIN
  -- Calculate analyst stats
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')),
    COUNT(*) FILTER (WHERE status = 'SUCCESS'),
    COUNT(*) FILTER (WHERE status = 'FAILED')
  INTO v_closed_analyses, v_successful_analyses, v_failed_analyses
  FROM analyses
  WHERE analyzer_id = p_user_id;

  -- Calculate win rate
  IF v_closed_analyses > 0 THEN
    v_win_rate := (v_successful_analyses::numeric / v_closed_analyses::numeric) * 100;
  ELSE
    v_win_rate := 0;
  END IF;

  -- Calculate target hits in last 30 days
  SELECT COUNT(*)
  INTO v_target_hits_30d
  FROM validation_events
  WHERE analysis_id IN (SELECT id FROM analyses WHERE analyzer_id = p_user_id)
  AND event_type = 'TARGET_HIT'
  AND hit_at >= now() - interval '30 days';

  -- Calculate consecutive stops (simplified: count recent consecutive failures)
  WITH recent_analyses AS (
    SELECT status, created_at
    FROM analyses
    WHERE analyzer_id = p_user_id
    AND status IN ('SUCCESS', 'FAILED')
    ORDER BY created_at DESC
    LIMIT 10
  )
  SELECT COUNT(*)
  INTO v_consecutive_stops
  FROM recent_analyses
  WHERE status = 'FAILED'
  AND created_at = (SELECT MAX(created_at) FROM recent_analyses WHERE status = 'FAILED');

  -- Calculate trader stats
  DECLARE
    v_total_ratings int;
    v_accurate_ratings int;
    v_rating_accuracy numeric;
    v_total_reposts int;
    v_successful_reposts int;
    v_unique_analysts int;
    v_unique_symbols int;
  BEGIN
    -- Ratings accuracy (placeholder - needs rating vs outcome comparison)
    SELECT COUNT(*)
    INTO v_total_ratings
    FROM analysis_ratings
    WHERE user_id = p_user_id;

    -- Reposts
    SELECT 
      COUNT(*),
      COUNT(*) FILTER (WHERE a.status = 'SUCCESS')
    INTO v_total_reposts, v_successful_reposts
    FROM reposts r
    JOIN analyses a ON r.analysis_id = a.id
    WHERE r.user_id = p_user_id;

    -- Unique analysts followed
    SELECT COUNT(DISTINCT following_id)
    INTO v_unique_analysts
    FROM follows
    WHERE follower_id = p_user_id;

    -- Unique symbols interacted with
    SELECT COUNT(DISTINCT s.symbol)
    INTO v_unique_symbols
    FROM engagement_events ee
    JOIN analyses a ON ee.entity_id = a.id
    JOIN symbols s ON a.symbol_id = s.id
    WHERE ee.user_id = p_user_id
    AND ee.entity_type = 'analysis';

    -- Update user_stats
    INSERT INTO user_stats (
      user_id,
      closed_analyses,
      successful_analyses,
      failed_analyses,
      win_rate,
      target_hits_last_30_days,
      consecutive_stops,
      total_ratings_given,
      rating_accuracy,
      total_reposts,
      successful_reposts,
      unique_analysts_followed,
      unique_symbols_interacted,
      last_calculated_at
    ) VALUES (
      p_user_id,
      v_closed_analyses,
      v_successful_analyses,
      v_failed_analyses,
      v_win_rate,
      v_target_hits_30d,
      v_consecutive_stops,
      v_total_ratings,
      0, -- placeholder for rating accuracy
      v_total_reposts,
      v_successful_reposts,
      v_unique_analysts,
      v_unique_symbols,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      closed_analyses = EXCLUDED.closed_analyses,
      successful_analyses = EXCLUDED.successful_analyses,
      failed_analyses = EXCLUDED.failed_analyses,
      win_rate = EXCLUDED.win_rate,
      target_hits_last_30_days = EXCLUDED.target_hits_last_30_days,
      consecutive_stops = EXCLUDED.consecutive_stops,
      total_ratings_given = EXCLUDED.total_ratings_given,
      total_reposts = EXCLUDED.total_reposts,
      successful_reposts = EXCLUDED.successful_reposts,
      unique_analysts_followed = EXCLUDED.unique_analysts_followed,
      unique_symbols_interacted = EXCLUDED.unique_symbols_interacted,
      last_calculated_at = now();
  END;
END;
$$;
