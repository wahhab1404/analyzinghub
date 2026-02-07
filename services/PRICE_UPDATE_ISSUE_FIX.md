# Price Update System - Critical Fix Required

## Issue
The cron job that updates trade prices every minute is failing with "Out of memory" errors. This is a Supabase platform limitation with the `pg_net` extension's `http_post()` function.

## Root Cause
- Supabase's `net.http_post()` function allocates memory for each HTTP request
- When called every minute via cron, it exhausts available memory
- This affects ALL Supabase databases using pg_net for scheduled HTTP calls

## Current Status
- ❌ Automated cron job: BROKEN
- ✅ Manual edge function calls: WORKING
- ✅ Edge function logic: WORKING PERFECTLY

## Immediate Workaround
Until we switch to an external cron service, manually trigger updates:

```bash
# Run this every minute to update prices
curl -X POST "https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-trade-tracker" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

## Permanent Solutions

### Option 1: External Cron Service (RECOMMENDED)
Use a free external cron service to call the edge function:

1. **cron-job.org** (Free tier: 1 job every minute)
   - Sign up at https://cron-job.org
   - Create new cron job
   - URL: `https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-trade-tracker`
   - Method: POST
   - Headers:
     ```
     Authorization: Bearer [SERVICE_ROLE_KEY]
     Content-Type: application/json
     ```
   - Schedule: Every 1 minute
   - Body: `{}`

2. **EasyCron** (Free tier available)
3. **Render Cron Jobs** (If hosting there)
4. **Railway Cron Jobs** (If hosting there)

### Option 2: Dedicated Microservice
Deploy a small Node.js service that calls the edge function every minute:

```javascript
// price-updater.js
setInterval(async () => {
  try {
    const response = await fetch(
      'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-trade-tracker',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
    console.log('Update completed:', await response.json());
  } catch (error) {
    console.error('Update failed:', error);
  }
}, 60000); // Every 60 seconds
```

Deploy this to:
- Render.com (free tier)
- Railway.app (free tier)
- Fly.io (free tier)

### Option 3: GitHub Actions (Free)
Create `.github/workflows/update-prices.yml`:

```yaml
name: Update Trade Prices
on:
  schedule:
    - cron: '* * * * *'  # Every minute
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Price Update
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/indices-trade-tracker" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

## Verification
After implementing any solution, verify it's working:

```sql
-- Check last update times (should be < 2 minutes ago)
SELECT
  polygon_option_ticker,
  current_contract,
  last_quote_at,
  NOW() - last_quote_at as age
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC;
```

## Affected Features
- ✅ Manual price updates (working)
- ❌ Automatic 1-minute updates (broken)
- ❌ Telegram notifications for new highs (delayed until prices update)
- ❌ Real-time trade monitoring (shows stale data)

## Next Steps
1. **IMMEDIATE**: Set up cron-job.org as temporary solution
2. **THIS WEEK**: Deploy dedicated microservice for production reliability
3. **OPTIONAL**: Add monitoring/alerting for failed updates
