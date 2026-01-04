# Indices Trade Addition - Debug Guide

## Common Issues and Solutions

### Issue 1: User doesn't have Analyzer role

**Symptom:** Can't add trades, button doesn't work

**Solution:** Update user role to Analyzer or SuperAdmin

```sql
-- Check user's current role
SELECT p.id, p.full_name, r.name as role_name
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.id = auth.uid();

-- Update user to Analyzer role
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE id = 'YOUR-USER-ID-HERE';
```

### Issue 2: Missing indices_reference data

**Symptom:** Error: "Invalid index symbol"

**Solution:** Add index reference data

```sql
-- Check if index exists
SELECT * FROM indices_reference WHERE index_symbol = 'SPX';

-- Add missing indices
INSERT INTO indices_reference (index_symbol, index_name, polygon_index_ticker, display_order)
VALUES
  ('SPX', 'S&P 500 Index', 'I:SPX', 1),
  ('NDX', 'Nasdaq 100 Index', 'I:NDX', 2),
  ('DJI', 'Dow Jones Industrial Average', 'I:DJI', 3),
  ('RUT', 'Russell 2000 Index', 'I:RUT', 4),
  ('VIX', 'CBOE Volatility Index', 'I:VIX', 5)
ON CONFLICT (index_symbol) DO NOTHING;
```

### Issue 3: Polygon API not configured

**Symptom:** Error: "Failed to fetch market data"

**Check:** Verify environment variable exists
- `NEXT_PUBLIC_POLYGON_API_KEY` must be set in `.env`
- Get free API key from https://polygon.io

### Issue 4: RLS Policy blocking insert

**Symptom:** "New row violates row-level security policy"

**Solution:** Temporary bypass for testing

```sql
-- Disable RLS temporarily (TESTING ONLY!)
ALTER TABLE index_trades DISABLE ROW LEVEL SECURITY;

-- After fixing, re-enable
ALTER TABLE index_trades ENABLE ROW LEVEL SECURITY;
```

## Quick Test Queries

### Test 1: Can I create analyses?
```sql
SELECT * FROM index_analyses WHERE author_id = auth.uid();
```

### Test 2: Do I have the right role?
```sql
SELECT indices_is_admin_or_analyzer(auth.uid());
-- Should return 'true'
```

### Test 3: Can I insert a trade?
```sql
SELECT * FROM index_trades WHERE author_id = auth.uid();
```

## Manual Trade Creation (Testing)

```sql
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
  stoploss,
  notes,
  published_at
)
VALUES (
  'YOUR-ANALYSIS-ID',
  auth.uid(),
  'active',
  'options',
  'call',
  'SPX',
  'I:SPX',
  'O:SPX251231C06000000',
  6000,
  '2025-12-31',
  'call',
  '{"price": 5950, "timestamp": "2025-01-04T10:00:00Z"}',
  '{"mid": 25.50, "bid": 25.00, "ask": 26.00, "timestamp": "2025-01-04T10:00:00Z"}',
  5950,
  25.50,
  5950,
  5950,
  25.50,
  25.50,
  '[{"level": 6000, "percentage": 10}, {"level": 6100, "percentage": 20}]',
  '{"level": 5900, "percentage": -5}',
  'Test trade',
  now()
);
```

## Check Logs

### Browser Console
1. Open browser dev tools (F12)
2. Go to Console tab
3. Look for errors when clicking "New Trade"
4. Check Network tab for failed API calls

### Server Logs
Look for errors in:
- API route responses
- Polygon API calls
- Database insertion errors
