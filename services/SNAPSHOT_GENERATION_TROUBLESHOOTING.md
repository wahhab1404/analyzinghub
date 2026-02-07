# Snapshot Generation Troubleshooting Guide

## Overview

This guide helps diagnose and fix issues with snapshot/image generation for manual trades and manual high updates.

---

## How Snapshot Generation Works

### Flow for Manual Trade Creation

1. User creates manual trade with Entry and High prices
2. If profit >= $100, system detects it as a **Winner**
3. API calls `generate-trade-snapshot` edge function
4. Edge function generates HTML snapshot
5. ApiFlash converts HTML to PNG image
6. Image URL is saved to `index_trades.contract_url`

### Flow for Manual High Update

1. User updates high price manually
2. System calls `update_trade_high_watermark` RPC
3. If new high detected OR trade becomes winner:
   - API calls `generate-trade-snapshot` edge function
   - Edge function generates HTML snapshot
   - ApiFlash converts HTML to PNG image
   - Image URL saved to `index_trades.contract_url`
   - Telegram notification queued to `telegram_outbox`

---

## Common Issues and Solutions

### Issue 1: No Image Generated

**Symptom:** Trade created but `contract_url` is null

**Check:**
```bash
# 1. Check environment variables are set
npm run dev
# Look for these in logs:
# NEXT_PUBLIC_SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...

# 2. Run test script
npm run tsx scripts/test-manual-trade-snapshot.ts
```

**Look for:**
- ✅ Trade created successfully
- ✅ Snapshot response status: 200
- ✅ Image URL returned
- ❌ Any error messages

**Possible Causes:**
1. **Missing env vars** - Edge function can't connect
2. **ApiFlash key invalid** - Can't generate screenshot
3. **Edge function not deployed** - 404 error
4. **HTML endpoint failing** - Can't render snapshot

---

### Issue 2: Edge Function Returns 404

**Symptom:** `Snapshot response status: 404`

**Solution:**
```bash
# Check if edge function is deployed
supabase functions list

# If not listed, deploy it:
supabase functions deploy generate-trade-snapshot
```

**Alternative:** Deploy via Supabase Dashboard
1. Go to Edge Functions section
2. Find `generate-trade-snapshot`
3. Click "Deploy"

---

### Issue 3: Edge Function Returns 500

**Symptom:** `Snapshot response status: 500`

**Check Edge Function Logs:**
```bash
# Via Supabase Dashboard:
# 1. Go to Edge Functions
# 2. Click on generate-trade-snapshot
# 3. View Logs tab

# Look for:
# - "[generate-trade-snapshot] Generating snapshot for trade:"
# - Error messages
# - ApiFlash errors
```

**Common 500 Causes:**
1. **Trade not found** - Invalid trade ID
2. **Missing entry_contract_snapshot** - Trade data incomplete
3. **ApiFlash timeout** - HTML too complex or slow
4. **HTML endpoint error** - Snapshot HTML failing

---

### Issue 4: HTML Endpoint Failing

**Test HTML Endpoint Directly:**
```bash
# Get a trade ID
curl http://localhost:3000/api/indices/trades

# Test HTML generation
curl "http://localhost:3000/api/indices/trades/TRADE_ID/snapshot-html?isNewHigh=true&newHighPrice=7.00"
```

**Should return:** HTML with trade details

**If fails:**
- Check trade has `entry_contract_snapshot`
- Check trade has `underlying_index_symbol`
- Check trade has `strike` and `direction`

---

### Issue 5: ApiFlash Not Working

**Symptom:** Edge function succeeds but no image URL

**Check:**
```javascript
// In edge function logs, look for:
"[generate-trade-snapshot] ApiFlash response status: 200"
```

**If 403:**
- ApiFlash key is invalid or expired
- Need to update `APIFLASH_KEY` env var

**If timeout:**
- HTML endpoint is too slow
- Try simpler HTML template

**Test ApiFlash Manually:**
```bash
curl "https://api.apiflash.com/v1/urltoimage?access_key=YOUR_KEY&url=https://example.com"
```

---

## Debugging Checklist

### ✅ Pre-Flight Checks

- [ ] Environment variables are set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APIFLASH_KEY` (in edge function env)

- [ ] Edge function is deployed:
  - `generate-trade-snapshot` visible in dashboard

- [ ] Supabase storage bucket exists:
  - `trade-snapshots` bucket created
  - Public access enabled

### ✅ Test Flow

1. **Create Manual Trade:**
   ```bash
   # Go to /dashboard/indices
   # Click "Quick Manual Trade"
   # Enter: Entry=$3.50, High=$7.00
   # Check browser console for logs
   ```

2. **Check Console Logs:**
   Look for:
   ```
   📸 [Manual Trade] Generating snapshot for new winning trade ID: xxx
   📊 [Manual Trade] Trade details: Entry=$3.50, High=$7.00, Profit=100.00%
   🔗 [Manual Trade] Calling: https://xxx.supabase.co/functions/v1/generate-trade-snapshot
   📡 [Manual Trade] Snapshot response status: 200
   ✅ [Manual Trade] Snapshot generated successfully: https://...
   ```

3. **If Errors Appear:**
   ```
   ❌ [Manual Trade] Failed to generate snapshot (500): ...
   ```
   - Copy full error message
   - Check edge function logs
   - Check HTML endpoint

### ✅ Database Check

```sql
-- Check recent trades
SELECT
  id,
  underlying_index_symbol,
  strike,
  contract_high_since,
  is_winning_trade,
  contract_url,
  created_at
FROM index_trades
WHERE is_manual_entry = true
ORDER BY created_at DESC
LIMIT 5;

-- Check if contract_url is populated
```

---

## Test Scripts

### Quick Test - Manual Trade
```bash
npm run tsx scripts/test-manual-trade-snapshot.ts
```

**Expected Output:**
```
🧪 Testing Manual Trade Snapshot Generation

Step 1: Creating a test manual trade...
Entry: $3.50, High: $7.00
Profit: 100.00% ($350.00)
Is Winner: YES ✅

✅ Trade created: ID xxx

Step 2: Calling snapshot generation edge function...
Calling: https://xxx.supabase.co/functions/v1/generate-trade-snapshot
Response status: 200

✅ Snapshot generated successfully!
Image URL: https://xxx.supabase.co/storage/v1/object/public/...
✅ Trade updated with image URL

✅ Test complete!
```

### Quick Test - Manual High Update
```bash
npm run tsx scripts/test-manual-high-update.ts
```

---

## Quick Fixes

### Fix 1: Re-deploy Edge Function
```bash
supabase functions deploy generate-trade-snapshot
```

### Fix 2: Update ApiFlash Key
```bash
# In Supabase Dashboard:
# 1. Go to Edge Functions
# 2. Click generate-trade-snapshot
# 3. Environment Variables
# 4. Add/Update: APIFLASH_KEY=your_new_key
```

### Fix 3: Test with Simple Trade
```javascript
// In browser console at /dashboard/indices
fetch('/api/indices/trades/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    index_symbol: 'SPX',
    strike: 6900,
    entry_price: 3.50,
    high_price: 7.00,
    direction: 'call'
  })
}).then(r => r.json()).then(console.log)

// Check response for imageUrl or errors
```

---

## Advanced Debugging

### Enable Verbose Logging

**In `/app/api/indices/trades/manual/route.ts`:**
Already has detailed logging! Look for:
- `📸 [Manual Trade]` messages
- `📡 [Manual Trade]` messages
- `✅ [Manual Trade]` messages
- `❌ [Manual Trade]` messages

**In edge function:**
```typescript
// Add at start of Deno.serve():
console.log("Incoming request:", req.method, req.url);
console.log("Headers:", Object.fromEntries(req.headers));
```

### Check Network Tab

1. Open DevTools → Network
2. Create manual trade
3. Look for:
   - `POST /api/indices/trades/manual` (should be 200)
   - Response should have `success: true`
   - Check if response includes `imageUrl`

---

## Success Indicators

### ✅ Everything Working:

1. **Console Logs:**
   ```
   ✅ [Manual Trade] Snapshot generated successfully: https://...
   ```

2. **Database:**
   ```sql
   SELECT contract_url FROM index_trades WHERE id = 'xxx';
   -- Should return: https://xxx.supabase.co/storage/...
   ```

3. **UI:**
   - Trade card shows snapshot image
   - Image is visible and correct
   - Shows "WINNER" badge if profit >= $100

4. **Telegram:**
   - Notification queued in `telegram_outbox`
   - Status: `pending`
   - Contains `snapshotUrl` in payload

---

## Still Not Working?

**Contact Points:**
1. Check all logs (API + Edge Function)
2. Run test script and copy output
3. Check database for `contract_url`
4. Verify edge function is deployed
5. Test ApiFlash key directly

**Most Common Fix:**
Re-deploy the edge function! Many issues are resolved by simply redeploying:
```bash
supabase functions deploy generate-trade-snapshot
```
