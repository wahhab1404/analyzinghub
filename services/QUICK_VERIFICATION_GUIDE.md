# Quick Verification Guide

## ✅ Edge Function Deployed
The `indices-trade-tracker` edge function has been deployed successfully!

## Verify Everything is Working

### Step 1: Run the Verification Script
```powershell
npm run verify:cron
```

This will test:
- Edge function is responding
- Active trades exist
- Prices are being updated
- Function executes correctly

### Step 2: Check Supabase Dashboard
1. Go to https://gbdzhdlpbwrnhykmstic.supabase.co
2. Navigate to **Database** → **Database** → **SQL Editor**
3. Run this query:

```sql
-- Check if cron job exists
SELECT * FROM cron.job WHERE jobname LIKE '%trade%';

-- Check last 10 cron runs
SELECT
  j.jobname,
  jr.status,
  jr.start_time,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE '%trade%'
ORDER BY jr.start_time DESC
LIMIT 10;
```

### Step 3: Test Telegram Notifications

#### Test New Analysis:
1. Go to Dashboard → Indices
2. Click "New Analysis"
3. Fill in the form
4. ✅ Check "Auto Publish to Telegram"
5. Select your Telegram channel
6. Set status to "Published"
7. Submit

**Expected:** Message appears in your Telegram channel immediately

#### Test New Trade:
1. Open an analysis
2. Click "Add Trade"
3. Fill in trade details
4. ✅ Check "Auto Publish to Telegram"
5. Submit

**Expected:** Trade notification appears in Telegram

### Step 4: Verify Real-Time Price Updates

1. Go to Dashboard → Indices
2. Open a trade detail page
3. Watch the "Last Updated" timestamp
4. During market hours, it should update every 1-2 minutes

**Note:** Outside market hours (9:30 AM - 4:00 PM ET), prices won't update

## Troubleshooting

### Prices Not Updating?
- Check if market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
- Run `npm run verify:cron` to see if function is working
- Check cron job logs in Supabase dashboard

### Telegram Not Working?
- Verify Telegram channel is connected in Settings → Telegram
- Check that "Auto Publish to Telegram" is checked when creating
- Make sure status is set to "Published" (not Draft)

### Cron Job Not Running?
- Check the SQL queries in Step 2 above
- Look for recent runs in `cron.job_run_details`
- If no runs, the cron might not be configured (check migration files)

## Need Help?
Run `npm run verify:cron` and share the output for troubleshooting.
