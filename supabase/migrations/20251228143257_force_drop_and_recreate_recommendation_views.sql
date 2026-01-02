/*
  # Force Drop and Recreate Recommendation System Materialized Views
  
  1. Force drop all existing views/materialized views
  2. Create new materialized views
  3. Add indexes
*/

-- Force drop all views
DO $$ 
BEGIN
    DROP VIEW IF EXISTS user_symbol_affinity CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS user_symbol_affinity CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP VIEW IF EXISTS user_analyzer_affinity CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS user_analyzer_affinity CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP VIEW IF EXISTS trending_analyses CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS trending_analyses CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP VIEW IF EXISTS analyzer_performance CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS analyzer_performance CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP VIEW IF EXISTS analyzer_rating_stats CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    DROP MATERIALIZED VIEW IF EXISTS analyzer_rating_stats CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- User symbol affinity
CREATE MATERIALIZED VIEW user_symbol_affinity AS
SELECT 
  ee.user_id,
  a.symbol_id,
  COUNT(*) as interaction_count
FROM engagement_events ee
JOIN analyses a ON ee.entity_id = a.id
WHERE ee.entity_type = 'analysis'
  AND ee.event_type IN ('view', 'like', 'bookmark', 'comment')
GROUP BY ee.user_id, a.symbol_id;

CREATE INDEX idx_user_symbol_affinity_user ON user_symbol_affinity(user_id);
CREATE INDEX idx_user_symbol_affinity_symbol ON user_symbol_affinity(symbol_id);

-- User analyzer affinity
CREATE MATERIALIZED VIEW user_analyzer_affinity AS
SELECT 
  ee.user_id,
  a.analyzer_id,
  COUNT(*) as interaction_count
FROM engagement_events ee
JOIN analyses a ON ee.entity_id = a.id
WHERE ee.entity_type = 'analysis'
  AND ee.event_type IN ('view', 'like', 'bookmark', 'comment')
GROUP BY ee.user_id, a.analyzer_id;

CREATE INDEX idx_user_analyzer_affinity_user ON user_analyzer_affinity(user_id);
CREATE INDEX idx_user_analyzer_affinity_analyzer ON user_analyzer_affinity(analyzer_id);

-- Trending analyses
CREATE MATERIALIZED VIEW trending_analyses AS
SELECT 
  a.id as analysis_id,
  COUNT(DISTINCT ee.id) as engagement_count,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'like' THEN ee.id END) as like_count,
  COUNT(DISTINCT CASE WHEN ee.event_type = 'view' THEN ee.id END) as view_count,
  MAX(ee.created_at) as last_engagement_at
FROM analyses a
LEFT JOIN engagement_events ee ON ee.entity_id = a.id AND ee.entity_type = 'analysis'
WHERE a.created_at >= NOW() - INTERVAL '7 days'
  AND a.status = 'IN_PROGRESS'
GROUP BY a.id
HAVING COUNT(DISTINCT ee.id) > 0;

CREATE INDEX idx_trending_analyses_engagement ON trending_analyses(engagement_count DESC);
CREATE INDEX idx_trending_analyses_id ON trending_analyses(analysis_id);

-- Analyzer performance
CREATE MATERIALIZED VIEW analyzer_performance AS
SELECT 
  a.analyzer_id as user_id,
  COUNT(DISTINCT a.id) as total_analyses,
  COUNT(DISTINCT CASE WHEN a.status = 'SUCCESS' THEN a.id END) as successful_analyses,
  COUNT(DISTINCT CASE WHEN a.status = 'FAILED' THEN a.id END) as failed_analyses,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN a.status IN ('SUCCESS', 'FAILED') THEN a.id END) > 0
    THEN COUNT(DISTINCT CASE WHEN a.status = 'SUCCESS' THEN a.id END)::numeric / 
         COUNT(DISTINCT CASE WHEN a.status IN ('SUCCESS', 'FAILED') THEN a.id END)::numeric
    ELSE 0
  END as win_rate
FROM analyses a
GROUP BY a.analyzer_id;

CREATE INDEX idx_analyzer_performance_user ON analyzer_performance(user_id);
CREATE INDEX idx_analyzer_performance_win_rate ON analyzer_performance(win_rate DESC);

-- Analyzer rating stats
CREATE MATERIALIZED VIEW analyzer_rating_stats AS
SELECT 
  a.analyzer_id,
  AVG(ar.rating)::numeric(10,2) as average_rating,
  COUNT(ar.id) as total_ratings,
  COUNT(DISTINCT ar.user_id) as unique_raters
FROM analyses a
JOIN analysis_ratings ar ON ar.analysis_id = a.id
GROUP BY a.analyzer_id;

CREATE INDEX idx_analyzer_rating_stats_analyzer ON analyzer_rating_stats(analyzer_id);
CREATE INDEX idx_analyzer_rating_stats_avg ON analyzer_rating_stats(average_rating DESC);

-- Grant permissions
GRANT SELECT ON user_symbol_affinity TO authenticated;
GRANT SELECT ON user_analyzer_affinity TO authenticated;
GRANT SELECT ON trending_analyses TO authenticated;
GRANT SELECT ON analyzer_performance TO authenticated;
GRANT SELECT ON analyzer_rating_stats TO authenticated;