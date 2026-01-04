# Testing Indices Features - Complete Checklist

## Prerequisites

### 1. User must have Analyzer or SuperAdmin role

Run this SQL query to check/update your role:

```sql
-- Check your current role
SELECT p.id, p.full_name, r.name as role_name
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.email = 'YOUR-EMAIL@example.com';

-- Update to Analyzer role if needed
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE email = 'YOUR-EMAIL@example.com';
```

### 2. Environment Variables

Verify `.env` has:
```
NEXT_PUBLIC_POLYGON_API_KEY=your_polygon_api_key_here
```

Get free API key from: https://polygon.io

### 3. Database Setup

Ensure indices reference data exists:
```sql
SELECT * FROM indices_reference;
-- Should show SPX, NDX, DJI, etc.
```

## Testing Add Trade Feature

### Step 1: Create an Analysis First
1. Go to `/dashboard/indices`
2. Click "Create Analysis" (if you're an Analyzer)
3. Fill in:
   - Index Symbol: SPX
   - Title: Test Analysis
   - Description: Testing trade addition
   - Upload chart image
   - Add targets (optional)
4. Click "Create Analysis"

### Step 2: Add Trade to Analysis
1. On the indices page, you should see your analysis card
2. Look for "New Trade" and "Follow-up" buttons at the bottom
   - If you DON'T see these buttons: Your role is not Analyzer/SuperAdmin
   - Check browser console (F12) for any errors
3. Click "New Trade" button
4. Dialog should open with trade form

### Step 3: Fill Trade Form
1. **Instrument Type**: Select "Options"
2. **Option Type**: Select "Call" or "Put"
3. **Expiration**: Click "This Week" or "This Month"
4. Click "Search Available Contracts"
5. Wait for contracts to load (check Network tab if nothing happens)
6. Click on a contract from the list
7. Add targets:
   - Target 1: Price level and percentage
   - Click "Add Target" for more
8. Add stop loss (optional)
9. Check "Auto-publish to Telegram" if desired
10. Click "Add Trade"

### Expected Results
✅ Toast notification: "Trade added successfully!"
✅ Trade appears in the analysis card
✅ Trade shows entry price and P&L

## Testing Follow-up Analysis

### Step 1: Click Follow-up Button
1. Find an existing analysis
2. Click "Follow-up" button
3. Dialog opens

### Step 2: Create Follow-up
1. Enter title (e.g., "Update")
2. Enter description
3. Upload new chart image
4. Click "Create Follow-up"

### Expected Results
✅ New analysis created
✅ Linked to parent analysis
✅ Shows in analyses list

## Troubleshooting

### Issue: Buttons Not Visible

**Check Console Logs:**
Open browser console (F12) and look for:
```
User data: {...}
User role: Analyzer
```

If you see `User role: Trader` - you need Analyzer role.

**Fix:**
```sql
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE id = (SELECT auth.uid());
```

### Issue: "Failed to fetch market data"

**Cause:** Polygon API key missing or invalid

**Fix:**
1. Check `.env` file has `NEXT_PUBLIC_POLYGON_API_KEY`
2. Verify key is valid at https://polygon.io/dashboard
3. Restart dev server after adding key

### Issue: "Analysis not found"

**Cause:** Trying to add trade to someone else's analysis

**Fix:** You can only add trades to YOUR OWN analyses

### Issue: Contract search returns no results

**Causes:**
1. Polygon API limit reached (free tier: 5 calls/min)
2. Invalid index symbol
3. No contracts available for selected date range

**Fix:**
1. Wait 1 minute and try again
2. Try different expiration date
3. Check Polygon API dashboard for usage

### Issue: RLS Policy Error

**Error:** "New row violates row-level security policy"

**Temporary Fix for Testing:**
```sql
-- TESTING ONLY - Disable RLS temporarily
ALTER TABLE index_trades DISABLE ROW LEVEL SECURITY;

-- After testing, re-enable:
ALTER TABLE index_trades ENABLE ROW LEVEL SECURITY;
```

## Manual Testing Queries

### Check if you can see analyses:
```sql
SELECT * FROM index_analyses
WHERE author_id = auth.uid()
ORDER BY created_at DESC;
```

### Check if you can see trades:
```sql
SELECT * FROM index_trades
WHERE author_id = auth.uid()
ORDER BY created_at DESC;
```

### Check RLS policies:
```sql
SELECT policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'index_trades'
ORDER BY policyname;
```

### Test indices helper function:
```sql
SELECT indices_is_admin_or_analyzer(auth.uid());
-- Should return TRUE if you're Analyzer/SuperAdmin
```

## Success Criteria

✅ Analyzer role assigned
✅ "New Trade" and "Follow-up" buttons visible on analysis cards
✅ Can search and select option contracts
✅ Can add multiple targets and stop loss
✅ Trade appears immediately after creation
✅ P&L calculations work correctly
✅ Follow-up analysis creates nested analysis
✅ Telegram notifications work (if configured)

## Common Errors and Solutions

### "Unauthorized"
- Not logged in or session expired
- Solution: Log out and log back in

### "Invalid index symbol"
- Index not in indices_reference table
- Solution: Add index reference data

### "You can only add trades to your own analyses"
- Trying to modify someone else's analysis
- Solution: Create your own analysis first

### Empty contract list
- Polygon API issue or no contracts available
- Solution: Try different date range or index

### Dialog doesn't open
- JavaScript error in browser
- Solution: Check browser console for errors

## Quick Test Script

```sql
-- 1. Set yourself as Analyzer
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE id = auth.uid();

-- 2. Verify role
SELECT indices_is_admin_or_analyzer(auth.uid());

-- 3. Create test analysis (do this via UI)

-- 4. Check analyses
SELECT id, index_symbol, title, author_id
FROM index_analyses
WHERE author_id = auth.uid();

-- 5. Try adding trade via UI

-- 6. Verify trade created
SELECT id, instrument_type, direction, status
FROM index_trades
WHERE author_id = auth.uid();
```

## Support

If issues persist after following this guide:
1. Check browser console for JavaScript errors
2. Check network tab for failed API calls
3. Verify database RLS policies
4. Ensure Polygon API key is valid
5. Try with a fresh browser session
