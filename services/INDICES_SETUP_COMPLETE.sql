-- ============================================
-- INDICES HUB - COMPLETE SETUP SCRIPT
-- ============================================
-- Run this to set up a user for testing indices features

-- STEP 1: Update user to Analyzer role
-- Replace 'YOUR-EMAIL@example.com' with your actual email
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE email = 'YOUR-EMAIL@example.com';

-- STEP 2: Verify your role
SELECT
  p.id,
  p.full_name,
  p.email,
  r.name as role_name
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.email = 'YOUR-EMAIL@example.com';

-- STEP 3: Check permissions view
SELECT * FROM v_user_indices_permissions
WHERE email = 'YOUR-EMAIL@example.com';

-- STEP 4: Verify indices reference data
SELECT * FROM indices_reference ORDER BY display_name;

-- STEP 5: Check existing analyses (if any)
SELECT
  id,
  index_symbol,
  title,
  status,
  visibility,
  created_at
FROM index_analyses
WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com')
ORDER BY created_at DESC;

-- STEP 6: Check RLS policies
SELECT
  policyname,
  permissive,
  roles,
  cmd,
  with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE tablename = 'index_trades'
ORDER BY cmd, policyname;

-- STEP 7: Test if you can create trades
SELECT indices_is_admin_or_analyzer(
  (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com')
);
-- Should return TRUE

-- ============================================
-- TROUBLESHOOTING QUERIES
-- ============================================

-- If buttons not showing, check this:
SELECT
  'User Role Check' as test,
  p.email,
  r.name as role_name,
  CASE
    WHEN r.name IN ('Analyzer', 'SuperAdmin') THEN 'PASS - Buttons should show'
    ELSE 'FAIL - Need Analyzer or SuperAdmin role'
  END as result
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.email = 'YOUR-EMAIL@example.com';

-- Check if any analyses exist:
SELECT
  'Analyses Check' as test,
  COUNT(*) as total_analyses,
  COUNT(*) FILTER (WHERE status = 'published') as published_count,
  COUNT(*) FILTER (WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com')) as my_analyses
FROM index_analyses;

-- Check if any trades exist:
SELECT
  'Trades Check' as test,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE status = 'active') as active_trades,
  COUNT(*) FILTER (WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com')) as my_trades
FROM index_trades;

-- ============================================
-- MANUAL TRADE CREATION (FOR TESTING)
-- ============================================
-- Only use this if UI is not working

-- First, get your analysis ID:
SELECT id, index_symbol, title
FROM index_analyses
WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com')
ORDER BY created_at DESC
LIMIT 5;

-- Then insert a test trade (update analysis_id):
/*
INSERT INTO index_trades (
  analysis_id,
  author_id,
  status,
  instrument_type,
  direction,
  underlying_index_symbol,
  polygon_underlying_index_ticker,
  polygon_option_ticker,
  strike,
  expiry,
  option_type,
  entry_underlying_snapshot,
  entry_contract_snapshot,
  current_underlying,
  current_contract,
  underlying_high_since,
  underlying_low_since,
  contract_high_since,
  contract_low_since,
  targets,
  notes,
  published_at
)
VALUES (
  'YOUR-ANALYSIS-ID-HERE',
  (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com'),
  'active',
  'options',
  'call',
  'SPX',
  'I:SPX',
  'O:SPX251231C06000000',
  6000,
  '2025-12-31',
  'call',
  '{"price": 5950, "timestamp": "2025-01-04T10:00:00Z", "session_high": 5960, "session_low": 5940}'::jsonb,
  '{"mid": 25.50, "bid": 25.00, "ask": 26.00, "timestamp": "2025-01-04T10:00:00Z"}'::jsonb,
  5950,
  25.50,
  5950,
  5950,
  25.50,
  25.50,
  '[{"level": 6000, "percentage": 10}, {"level": 6100, "percentage": 20}]'::jsonb,
  'Test trade created manually',
  now()
);
*/

-- ============================================
-- RESET (DANGER ZONE)
-- ============================================
-- Only use if you need to start fresh

-- Delete all your trades:
-- DELETE FROM index_trades WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com');

-- Delete all your analyses:
-- DELETE FROM index_analyses WHERE author_id = (SELECT id FROM profiles WHERE email = 'YOUR-EMAIL@example.com');

-- ============================================
-- USEFUL MONITORING QUERIES
-- ============================================

-- Real-time activity feed:
SELECT
  'analysis' as type,
  ia.title as item,
  ia.index_symbol,
  ia.created_at,
  p.full_name as author
FROM index_analyses ia
JOIN profiles p ON p.id = ia.author_id
WHERE ia.created_at > now() - interval '1 hour'
UNION ALL
SELECT
  'trade' as type,
  concat(it.direction, ' ', it.instrument_type) as item,
  it.underlying_index_symbol,
  it.created_at,
  p.full_name as author
FROM index_trades it
JOIN profiles p ON p.id = it.author_id
WHERE it.created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- System health check:
SELECT
  (SELECT COUNT(*) FROM index_analyses WHERE status = 'published') as published_analyses,
  (SELECT COUNT(*) FROM index_trades WHERE status = 'active') as active_trades,
  (SELECT COUNT(*) FROM profiles WHERE role_id = (SELECT id FROM roles WHERE name = 'Analyzer')) as total_analyzers,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions;
