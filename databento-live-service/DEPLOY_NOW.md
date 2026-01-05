# 🚀 DEPLOY LIVE STREAMING NOW

Your system is ready! You have **18 active SPX options trades** waiting for live prices.

## Quick Deploy (5 minutes)

### Option 1: Automated Deploy Script

```bash
cd databento-live-service
./deploy-now.sh
```

### Option 2: Manual Deploy (Step by Step)

#### 1. Install Fly CLI (if not installed)

```bash
curl -L https://fly.io/install.sh | sh
```

#### 2. Login to Fly.io

```bash
fly auth login
```

#### 3. Create App

```bash
cd databento-live-service
fly apps create databento-live-service --region iad
```

#### 4. Set Secrets

```bash
fly secrets set \
  DATABENTO_API_KEY="db-DiedQk3PdYRE4Dr5njjxeyHN7c3es" \
  SUPABASE_URL="https://gbdzhdlpbwrnhykmstic.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8" \
  -a databento-live-service
```

#### 5. Deploy

```bash
fly deploy -a databento-live-service
```

#### 6. Monitor Logs

```bash
fly logs -a databento-live-service
```

You should see:
```
🚀 STARTING DATABENTO LIVE SERVICE
============================================================
📍 Supabase: https://gbdzhdlpbwrnhykmstic.supabase.co
🔑 API Key: db-DiedQ...c3es
⏰ Extended Hours: ENABLED (24/5 SPX trading)
============================================================
🎯 Found 18 unique symbols to subscribe:
   - SPXW260105C06895000
   - SPXW260105C06880000
   - ...
📡 Subscribing to SPXW260105C06895000 on OPRA.PILLAR (extended hours enabled)
✅ Subscribed to SPXW260105C06895000 - Ready for 24/5 trading
...
[10:30:15] 📊 5 updates | SPXW260105C06895000 = $12.3500 | Δ 0.15%
```

## What Will Happen

Once deployed, the service will:

1. ✅ Connect to Databento Live API
2. ✅ Subscribe to all 18 active SPX options
3. ✅ Stream live prices in real-time (<1 second latency)
4. ✅ Update your database automatically
5. ✅ Monitor targets and stops 24/5
6. ✅ Send notifications on hits

## Verify It's Working

### Check Database Updates

```bash
# Install supabase CLI if needed
npm install -g supabase

# Query recent updates
supabase db query "
SELECT
  polygon_option_ticker,
  current_contract,
  last_quote_at,
  EXTRACT(EPOCH FROM (NOW() - last_quote_at)) as seconds_ago
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC
LIMIT 5;
"
```

**Expected:** `seconds_ago` should be < 10 seconds

### Check Service Status

```bash
fly status -a databento-live-service
```

**Expected:** Status = `running`

### View Live Logs

```bash
fly logs -a databento-live-service --region iad
```

**Expected:** See price updates streaming

## Troubleshooting

### "App not found"

Run: `fly apps create databento-live-service --region iad`

### "Authentication failed"

Check your Databento API key at https://databento.com/portal/keys

### "No updates in database"

1. Check service is running: `fly status -a databento-live-service`
2. Check logs for errors: `fly logs -a databento-live-service`
3. Verify active trades: `./check_trades.sh`

### "Service keeps restarting"

Check logs for specific error: `fly logs -a databento-live-service`

## After Deployment

Once confirmed working:

1. ✅ Disable the old cron job in Supabase Dashboard
2. ✅ Monitor for 24 hours to ensure stability
3. ✅ Check your frontend - prices should update in real-time
4. ✅ Test target/stop notifications

## Your Active Trades

You currently have 18 active SPX options ready to stream:

- SPXW260105C06895000 (Strike: 6895)
- SPXW260105C06880000 (Strike: 6880)
- SPXW260105C06885000 (Strike: 6885)
- SPXW260105C06875000 (Strike: 6875)
- SPXW260105C06870000 (Strike: 6870)
- SPXW260105C06890000 (Strike: 6890)
- SPXW260105C06860000 (Strike: 6860)

All expiring January 5, 2026. **These trade 24/5 during extended hours!**

## Cost

- **Service:** $3/month (Fly.io 512MB RAM)
- **Data:** ~$5/month (18 symbols streaming)
- **Total:** ~$8/month for real-time updates

**vs. 60 second delays with current system**

## Need Help?

- **Service logs:** `fly logs -a databento-live-service`
- **Databento status:** https://status.databento.com
- **Fly.io docs:** https://fly.io/docs

---

**⚠️ IMPORTANT:** SPX options trade during extended hours (Sunday 6 PM - Friday 9:15 AM ET). This service will stream prices 24/5!
