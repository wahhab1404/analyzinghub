# Migration Guide: Historical API → Live API

This guide explains how to migrate from polling-based Historical API to real-time Live API streaming.

## Current Architecture (Historical API)

```
┌────────────────────────────────────────────┐
│  Supabase Cron (every 1 minute)          │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│  Edge Function: indices-trade-tracker     │
│  - Fetch active trades                    │
│  - Poll Databento Historical API          │
│  - Update database                        │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│  https://hist.databento.com               │
│  - GET /v0/timeseries.get_range           │
│  - Last 60 seconds of data                │
└────────────┬───────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────┐
│  Supabase Database                        │
│  - Updates every ~60 seconds              │
└────────────────────────────────────────────┘
```

**Limitations:**
- ❌ 60 second latency
- ❌ Not real-time
- ❌ Edge Function timeout constraints
- ❌ Higher API costs per request

## New Architecture (Live API)

```
┌────────────────────────────────────────────┐
│  Databento Live Gateway (WebSocket)       │
│  - OPRA.PILLAR (Options)                  │
│  - XNAS.ITCH (Indices)                    │
└────────────┬───────────────────────────────┘
             │ Persistent connection
             │ Real-time stream
             ▼
┌────────────────────────────────────────────┐
│  Python Service (databento-live-service)  │
│  - WebSocket client                       │
│  - Quote processing                       │
│  - Trade monitoring                       │
└────────────┬───────────────────────────────┘
             │ Instant updates
             ▼
┌────────────────────────────────────────────┐
│  Supabase Database                        │
│  - Updates in <1 second                   │
└────────────────────────────────────────────┘
```

**Benefits:**
- ✅ <1 second latency
- ✅ True real-time updates
- ✅ No timeout constraints
- ✅ Lower cost per update
- ✅ Automatic reconnection
- ✅ Better user experience

## Migration Steps

### Step 1: Deploy the Live Service

1. **Clone and setup:**
```bash
cd databento-live-service
cp .env.example .env
```

2. **Configure `.env`:**
```env
DATABENTO_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

3. **Test locally:**
```bash
pip install -r requirements.txt
python src/main.py
```

4. **Deploy to Fly.io:**
```bash
fly launch
fly secrets set DATABENTO_API_KEY=your_key
fly secrets set SUPABASE_URL=your_url
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
fly deploy
```

### Step 2: Disable the Cron Job

1. **Go to Supabase Dashboard**
2. **Navigate to Database → Cron Jobs**
3. **Find job:** `track-indices-trades-every-minute`
4. **Disable or delete it**

This prevents duplicate updates from both systems.

### Step 3: Keep Edge Function (Optional)

You can keep the Edge Function as a fallback:

```typescript
// In indices-trade-tracker/index.ts
const LIVE_SERVICE_RUNNING = Deno.env.get("LIVE_SERVICE_ENABLED") === "true";

if (LIVE_SERVICE_RUNNING) {
  return new Response(
    JSON.stringify({ ok: true, message: "Live service is handling updates" }),
    { status: 200 }
  );
}

// ... rest of polling code
```

### Step 4: Monitor the Migration

**Check Live Service Logs:**
```bash
fly logs -a databento-live-service
```

**Expected output:**
```
INFO - Starting Databento Live Service...
INFO - Found 5 unique symbols to subscribe
INFO - Subscribing to SPXW250103P06050000 on OPRA.PILLAR
INFO - Service is running
INFO - Processed 10 updates. Latest: SPXW250103P06050000 = $12.35
```

**Check Database Updates:**
```sql
SELECT
  id,
  polygon_option_ticker,
  current_contract,
  last_quote_at,
  NOW() - last_quote_at as seconds_since_update
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC;
```

Should see `seconds_since_update` < 10 seconds.

### Step 5: Verify Real-Time Updates

**Before (Historical API):**
```
Update 1: 10:00:00
Update 2: 10:01:00  ← 60 second gap
Update 3: 10:02:00
```

**After (Live API):**
```
Update 1: 10:00:00.123
Update 2: 10:00:01.456  ← Sub-second updates
Update 3: 10:00:02.789
Update 4: 10:00:03.012
```

## Code Changes Required

### No Frontend Changes Needed

The Live service updates the same database tables, so your frontend code continues to work:

```typescript
// This code doesn't change
const { data: trades } = await supabase
  .from('index_trades')
  .select('*')
  .eq('status', 'active');
```

### Optional: Real-time Subscriptions

You can add Supabase real-time subscriptions for instant UI updates:

```typescript
// In your React component
useEffect(() => {
  const subscription = supabase
    .channel('trade-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'index_trades',
        filter: `status=eq.active`
      },
      (payload) => {
        console.log('Price updated!', payload.new);
        // Update UI instantly
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

## Rollback Plan

If you need to rollback:

1. **Stop Live Service:**
```bash
fly scale count 0 -a databento-live-service
```

2. **Re-enable Cron Job:**
   - Go to Supabase Dashboard
   - Enable the cron job again

3. **Verify Polling Resumes:**
   - Check Edge Function logs
   - Verify updates continue every minute

## Cost Comparison

### Historical API (Polling)
```
60 requests/hour × 24 hours × 30 days = 43,200 requests/month

Cost per request: ~$0.0001
Monthly cost: ~$4.32
```

### Live API (Streaming)
```
10 symbols × continuous streaming = ~20 MB/hour

Cost per MB: ~$0.001
Hourly cost: ~$0.02
Daily cost: ~$0.48
Monthly cost: ~$14.40
```

**Note:** Live API costs more but provides 60x faster updates. For trading applications, real-time data is essential.

## Optimization Tips

### Reduce Costs

1. **Subscribe only to active trades:**
```python
# Already implemented - service auto-discovers symbols
symbols = self._get_symbols_to_subscribe()
```

2. **Increase update threshold:**
```python
# In src/main.py, change from 0.1% to 0.5%
if price_change_pct >= 0.5:  # Less frequent updates
    self._update_database(...)
```

3. **Use batch updates:**
```python
# Buffer updates and write in batches of 10
if len(self.update_buffer) >= 10:
    self._flush_updates()
```

### Improve Reliability

1. **Add health checks:**
```python
# HTTP endpoint for monitoring
health_server = HTTPServer(('', 8080), HealthCheckHandler)
```

2. **Monitor heartbeats:**
```python
# Already implemented
client = db.Live(
    key=api_key,
    heartbeat_interval_s=30  # Detect hung connections
)
```

3. **Log to external service:**
```python
import sentry_sdk
sentry_sdk.init("your-dsn")
```

## Troubleshooting

### Service Keeps Restarting

**Check logs:**
```bash
fly logs -a databento-live-service --region iad
```

**Common issues:**
- Missing environment variables
- Invalid API key
- No active trades

### Duplicate Updates

If both cron and live service are running:
- Disable one of them
- Check `last_quote_at` timestamps (should be continuous, not gaps)

### Price Updates Stopped

**Check service status:**
```bash
fly status -a databento-live-service
```

**Restart if needed:**
```bash
fly apps restart databento-live-service
```

## Next Steps

After successful migration:

1. **Monitor for 24 hours** - Ensure stable operation
2. **Remove old code** - Delete Edge Function if not needed
3. **Add monitoring** - Set up alerts for service downtime
4. **Optimize costs** - Adjust update thresholds as needed
5. **Add features** - Implement new features possible with real-time data

## Support

Need help? Check:
- Databento Docs: https://databento.com/docs/api-reference-live
- Service Logs: `fly logs -a databento-live-service`
- Database Logs: Supabase Dashboard → Logs
