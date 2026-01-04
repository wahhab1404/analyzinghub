# Indices Workflow - Quick Deployment Guide

## Step 1: Database Schema (Already Applied)

The migration has been applied:
```
supabase/migrations/20260104_xxxxxx_extend_indices_workflow_system.sql
```

This adds:
- New fields to `index_analyses`, `index_trades`, `analysis_updates`, `trade_updates`
- New `telegram_send_log` table for deduplication
- Helper functions for Telegram publishing

## Step 2: Edge Functions (Already Deployed)

Two Edge Functions are deployed:

### 1. indices-telegram-publisher
Handles all Telegram publishing for analyses, trades, updates, and results.

### 2. indices-trade-tracker
Scheduled job that updates prices and auto-classifies WIN/LOSS.

## Step 3: Configure Cron Job

**IMPORTANT**: You need to set up the cron job in Supabase Dashboard:

1. Go to Supabase Dashboard → Database → Cron Jobs
2. Click "Create a new cron job"
3. Use this configuration:

```sql
-- Name: indices-trade-tracker
-- Schedule: */3 * * * * (every 3 minutes)
-- Or for market hours only: */3 9-16 * * 1-5

SELECT
  net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/indices-trade-tracker',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
```

**Replace**:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_SERVICE_ROLE_KEY` with your service role key from Settings → API

## Step 4: Environment Variables

Verify these are set:

```env
# In your .env file or Netlify environment
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
POLYGON_API_KEY=your-polygon-api-key
APP_BASE_URL=https://your-domain.com
```

## Step 5: Build and Deploy

```bash
npm run build
npm run start  # Or deploy to Netlify
```

## Step 6: Test the System

### Test 1: Create Analysis with Telegram

```bash
curl -X POST https://your-domain.com/api/indices/analyses \
  -H "Content-Type: application/json" \
  -d '{
    "index_symbol": "SPX",
    "title": "Test Analysis",
    "body": "This is a test",
    "chart_image_url": "https://example.com/chart.png",
    "timeframe": "1h",
    "schools_used": ["Classic TA"],
    "telegram_channel_id": "your-channel-uuid",
    "auto_publish_telegram": true,
    "visibility": "public",
    "status": "published"
  }'
```

Check:
- Analysis created in database
- Message posted to Telegram channel

### Test 2: Create Trade

```bash
curl -X POST https://your-domain.com/api/indices/analyses/{analysisId}/trades \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_id": "analysis-uuid",
    "instrument_type": "options",
    "direction": "call",
    "underlying_index_symbol": "SPX",
    "trade_price_basis": "OPTION_PREMIUM",
    "polygon_option_ticker": "O:SPX251231C05900000",
    "strike": 5900,
    "expiry": "2025-12-31",
    "option_type": "call",
    "targets": [{"level": 15.50, "description": "Target 1"}],
    "stoploss": {"level": 8.00, "description": "Stop"},
    "auto_publish_telegram": true
  }'
```

Check:
- Trade created with status 'active'
- Entry prices captured from Polygon
- Message posted to Telegram

### Test 3: Verify Trade Tracker

```bash
# Manually trigger the tracker
curl -X POST https://your-project.supabase.co/functions/v1/indices-trade-tracker \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Check:
- Trades have updated `current_contract` and `last_quote_at`
- `contract_high_since` is tracking highest price

## Monitoring

### Check Active Trades

```sql
SELECT
  id,
  polygon_option_ticker,
  status,
  current_contract,
  contract_high_since,
  last_quote_at
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC;
```

### Check Telegram Send Log

```sql
SELECT
  entity_type,
  status,
  created_at,
  sent_at,
  error
FROM telegram_send_log
ORDER BY created_at DESC
LIMIT 20;
```

### Check Cron Job Status

```sql
SELECT * FROM cron.job WHERE jobname LIKE '%indices%';
SELECT * FROM cron.job_run_details WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE '%indices%'
)
ORDER BY start_time DESC
LIMIT 10;
```

## Common Issues

### Issue: Telegram not sending

**Solution**:
1. Check bot token in `admin_settings`:
   ```sql
   SELECT * FROM admin_settings WHERE setting_key = 'telegram_bot_token';
   ```
2. Verify channel is enabled:
   ```sql
   SELECT * FROM telegram_channels WHERE enabled = true;
   ```
3. Check Edge Function logs in Supabase Dashboard

### Issue: Trades not updating

**Solution**:
1. Verify cron job is running (see monitoring above)
2. Check Polygon API key is set
3. Check Edge Function logs for errors
4. Manually trigger tracker to test

### Issue: WIN/LOSS not detecting

**Solution**:
1. Verify targets and stoploss are set correctly
2. Check `trade_price_basis` matches your strategy
3. Verify current prices are updating (check `last_quote_at`)

## Production Checklist

- [ ] Database schema applied
- [ ] Edge Functions deployed
- [ ] Cron job configured and running
- [ ] Environment variables set
- [ ] Telegram bot token configured
- [ ] Telegram channels created and verified
- [ ] Test analysis created and published
- [ ] Test trade created and tracking
- [ ] Trade tracker running successfully
- [ ] Telegram messages sending correctly
- [ ] Monitoring queries working
- [ ] Backups configured

## Next Steps

1. Create UI components for analysts to:
   - Create analyses with all new fields
   - Add trades with price basis selection
   - Post bilingual updates
   - View HPAE (Highest Price After Entry)
   - See WIN/LOSS results

2. Add performance analytics:
   - Win rate per analyst
   - Average HPAE per trade
   - Best performing index
   - Most successful timeframe

3. Enhance notifications:
   - Email alerts for WIN/LOSS
   - Push notifications
   - SMS for critical updates

## Support

See complete documentation: `INDICES_WORKFLOW_SYSTEM.md`

For issues, check:
1. Supabase Edge Function logs
2. Database query logs
3. Telegram send log
4. Cron job run history
