/*
  # Populate Rankings Data - Simple Version

  ## Changes
  1. Backfill points for existing analyses
  2. Backfill points for social interactions
  3. Calculate user stats
  4. Update points balances
  
  ## Security
  - No RLS changes
*/

-- Simple function to backfill analyst points
DO $$
DECLARE
  analysis_rec RECORD;
BEGIN
  -- Points for creating analyses
  FOR analysis_rec IN 
    SELECT id, analyzer_id, status, created_at
    FROM analyses
    WHERE analyzer_id IS NOT NULL
  LOOP
    -- 10 points for publishing
    INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
    VALUES (
      analysis_rec.analyzer_id,
      'analyst',
      'analysis_created',
      'analysis',
      analysis_rec.id,
      10,
      jsonb_build_object('analysis_id', analysis_rec.id),
      analysis_rec.created_at
    )
    ON CONFLICT DO NOTHING;

    -- 50 points for successful analysis
    IF analysis_rec.status = 'SUCCESS' THEN
      INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
      VALUES (
        analysis_rec.analyzer_id,
        'analyst',
        'target_hit',
        'target',
        analysis_rec.id,
        50,
        jsonb_build_object('analysis_id', analysis_rec.id, 'targetIndex', '1'),
        analysis_rec.created_at + interval '1 hour'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- -30 points for failed analysis
    IF analysis_rec.status = 'FAILED' THEN
      INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
      VALUES (
        analysis_rec.analyzer_id,
        'analyst',
        'stop_hit',
        'analysis',
        analysis_rec.id,
        -30,
        jsonb_build_object('analysis_id', analysis_rec.id, 'targetIndex', '0'),
        analysis_rec.created_at + interval '1 hour'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Backfill trader points for likes
INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
SELECT 
  l.user_id,
  'trader',
  'like',
  'analysis',
  l.analysis_id,
  1,
  jsonb_build_object('analysis_id', l.analysis_id, 'like_id', l.id),
  l.created_at
FROM likes l
WHERE l.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill trader points for comments
INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
SELECT 
  c.user_id,
  'trader',
  'comment',
  'analysis',
  c.analysis_id,
  5,
  jsonb_build_object('analysis_id', c.analysis_id, 'comment_id', c.id),
  c.created_at
FROM comments c
WHERE c.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill trader points for reposts
INSERT INTO user_points_ledger (user_id, role, event_type, entity_type, entity_id, points_delta, metadata, created_at)
SELECT 
  r.user_id,
  'trader',
  'repost',
  'analysis',
  r.analysis_id,
  3,
  jsonb_build_object('analysis_id', r.analysis_id, 'repost_id', r.id),
  r.created_at
FROM reposts r
WHERE r.user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update points balances using the existing function
SELECT update_points_balance();

-- Update user stats for all active users
DO $$
DECLARE
  user_rec RECORD;
  v_closed int;
  v_successful int;
  v_failed int;
  v_win_rate numeric;
BEGIN
  FOR user_rec IN 
    SELECT DISTINCT analyzer_id as user_id 
    FROM analyses 
    WHERE analyzer_id IS NOT NULL
  LOOP
    -- Calculate stats
    SELECT 
      COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')),
      COUNT(*) FILTER (WHERE status = 'SUCCESS'),
      COUNT(*) FILTER (WHERE status = 'FAILED')
    INTO v_closed, v_successful, v_failed
    FROM analyses
    WHERE analyzer_id = user_rec.user_id;

    IF v_closed > 0 THEN
      v_win_rate := (v_successful::numeric / v_closed::numeric) * 100;
    ELSE
      v_win_rate := 0;
    END IF;

    -- Update stats
    UPDATE user_stats
    SET 
      closed_analyses = v_closed,
      successful_analyses = v_successful,
      failed_analyses = v_failed,
      win_rate = v_win_rate,
      last_calculated_at = now()
    WHERE user_id = user_rec.user_id;
  END LOOP;
END $$;