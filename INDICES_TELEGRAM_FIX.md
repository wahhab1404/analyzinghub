# Indices Telegram & Price Updates Fix

## Issues Fixed

### 1. New Index Analyses Not Sending to Telegram
**Problem:** When creating a new index analysis, the Telegram notification was not being sent.

**Root Cause:** The API was sending incorrect payload format to the `indices-telegram-publisher` edge function.

**Fix:** Updated `/app/api/indices/analyses/route.ts` (lines 196-227) to send:
```javascript
{
  type: 'new_analysis',
  data: analysis,  // Full analysis object
  channelId: telegram_channel_id
}
```

### 2. New Trades Not Sending to Telegram
**Problem:** When creating a new trade, the Telegram notification was not being sent.

**Root Cause:** Same as above - incorrect payload format.

**Fix:** Updated `/app/api/indices/analyses/[id]/trades/route.ts` (lines 256-299) to send:
```javascript
{
  type: 'new_trade',
  data: trade,  // Full trade object
  channelId: channelId,
  isNewHigh: false
}
```

### 3. Trade Price Updates in Cron Job
**Problem:** When the cron job detected new highs or trade results, it was sending incorrect payload format.

**Root Cause:** The `indices-trade-tracker` edge function was using old payload format.

**Fix:** Updated `/supabase/functions/indices-trade-tracker/index.ts`:
- Lines 130-175: New high notifications now fetch full trade data and send correct payload
- Lines 226-258: Trade result notifications now fetch full trade data and send correct payload

## Contract Price Updates

### How Real-Time Prices Work
1. The `indices-trade-tracker` edge function runs every 1 minute (via Supabase cron)
2. It fetches prices from Polygon API or Databento API
3. Updates `current_contract` and `current_underlying` fields in the database
4. Frontend polls `/api/indices/trades/[id]` every 5 seconds to get updated prices

### Verifying the Cron Job is Running

Check if the edge function is deployed:
```bash
# From Supabase dashboard or CLI
supabase functions list
```

The `indices-trade-tracker` should be listed.

Check cron job logs:
```sql
-- In Supabase SQL Editor
SELECT * FROM cron.job WHERE jobname LIKE '%trade%' ORDER BY created_at DESC;
SELECT * FROM cron.job_run_details WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE '%trade%'
) ORDER BY start_time DESC LIMIT 10;
```

### Common Issues

1. **API Keys Not Set**
   - Check that `POLYGON_API_KEY` or `DATABENTO_API_KEY` is set in edge function secrets
   - The function requires at least one API key

2. **Market Closed**
   - Prices only update during market hours
   - After hours, you'll see stale prices (this is expected)

3. **Rate Limits**
   - Free Polygon API has rate limits
   - The cron runs every 1 minute and processes 50 trades at a time
   - If you have many active trades, some might not update every minute

### Testing Telegram Notifications

1. **Test New Analysis:**
   - Create a new index analysis
   - Make sure "Auto Publish to Telegram" is checked
   - Select a telegram channel
   - Set status to "published"
   - Should appear in Telegram channel immediately

2. **Test New Trade:**
   - Create a new trade on an analysis
   - Make sure "Auto Publish to Telegram" is checked
   - Should appear in Telegram channel immediately

3. **Test Price Updates:**
   - Wait for prices to move significantly
   - When a new high is reached, a notification should be sent
   - When target/stop is hit, a result notification should be sent

## Deployment Complete

The `indices-trade-tracker` edge function has been deployed automatically!

## How to Verify Everything is Working

### Quick Verification (Recommended)
Run this command to check everything at once:
```powershell
npm run verify:cron
```

This will:
- ✅ Check if the edge function is deployed
- ✅ Show active trades and when they were last updated
- ✅ Test the function directly to see if it's updating prices
- ✅ Provide SQL queries to check cron job status

### Manual Verification Steps

#### 1. Check Cron Job in Supabase Dashboard
Go to your Supabase dashboard → Database → Cron Jobs and run this SQL:

```sql
-- Check if cron job exists and is scheduled
SELECT
  jobid,
  jobname,
  schedule,
  active,
  nodename
FROM cron.job
WHERE jobname LIKE '%trade%';

-- Check recent cron runs (last 10)
SELECT
  j.jobname,
  jr.runid,
  jr.status,
  jr.start_time,
  jr.end_time,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE '%trade%'
ORDER BY jr.start_time DESC
LIMIT 10;
```

#### 2. Check if Prices are Being Updated
Look at active trades in your database:

```sql
SELECT
  id,
  polygon_option_ticker,
  current_contract,
  last_quote_at,
  EXTRACT(EPOCH FROM (NOW() - last_quote_at))/60 as minutes_since_update
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC
LIMIT 10;
```

If `minutes_since_update` is less than 2-3 minutes during market hours, the cron is working!

#### 3. Test Telegram Notifications
1. Create a new index analysis with Telegram enabled
2. Create a new trade on that analysis
3. Check your Telegram channel for the notifications

## Next Steps

1. ✅ Edge function deployed (already done)
2. Run `npm run verify:cron` to verify everything is working
3. Test creating a new analysis and trade with Telegram enabled
4. Monitor the logs to ensure notifications are being sent

## Files Modified

1. `/app/api/indices/analyses/route.ts` - Fixed new analysis Telegram payload
2. `/app/api/indices/analyses/[id]/trades/route.ts` - Fixed new trade Telegram payload
3. `/supabase/functions/indices-trade-tracker/index.ts` - Fixed cron job Telegram payloads
