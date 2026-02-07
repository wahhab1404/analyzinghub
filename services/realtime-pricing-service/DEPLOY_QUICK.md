# Quick Deploy Guide - Realtime Pricing Service

This service updates the database every 10 seconds with live prices from Polygon.io.

## What This Service Does

- Fetches live quotes every 5 seconds from Polygon.io
- Updates Supabase database every 10 seconds (6x per minute)
- Provides SSE streaming for frontend real-time updates
- Tracks highs/lows since trade entry
- Uses Redis for fast in-memory caching

## Prerequisites

1. Fly.io account (free tier works)
2. Upstash Redis account (free tier works)
3. Polygon.io API key
4. Supabase credentials

## Setup Redis (Upstash)

1. Go to https://upstash.com
2. Create new Redis database
3. Copy the Redis URL (format: `redis://default:xxx@xxx.upstash.io:6379`)

## Deploy to Fly.io

```bash
# Navigate to service directory
cd realtime-pricing-service

# Install Fly CLI if not installed
# curl -L https://fly.io/install.sh | sh

# Login to Fly.io
fly auth login

# Create the app (first time only)
fly apps create indices-hub-realtime

# Set environment secrets
fly secrets set POLYGON_API_KEY="your_polygon_api_key"
fly secrets set SUPABASE_URL="https://xxx.supabase.co"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
fly secrets set REDIS_URL="redis://default:xxx@xxx.upstash.io:6379"

# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs

# Check health
curl https://indices-hub-realtime.fly.dev/health
```

## Verify It's Working

```bash
# Check health endpoint
curl https://indices-hub-realtime.fly.dev/health

# Expected response:
{
  "status": "ok",
  "redis": "connected",
  "supabase": "connected",
  "polygon": "connected",
  "uptime": 123,
  "activeConnections": 0,
  "activeSubscriptions": 0
}
```

## Check Database Updates

Run this SQL in Supabase to see live updates:

```sql
SELECT
  id,
  polygon_option_ticker,
  current_contract,
  current_underlying,
  last_quote_at,
  updated_at
FROM index_trades
WHERE status = 'active'
ORDER BY updated_at DESC
LIMIT 10;
```

Refresh every 10 seconds - you should see `updated_at` and prices changing.

## Monitor Performance

```bash
# Watch logs in real-time
fly logs

# Check resource usage
fly vm status

# Scale if needed (increase memory)
fly scale memory 1024
```

## Update Frequency

Current settings:
- **Polygon fetch**: Every 5 seconds (REST polling for options)
- **Database persist**: Every 10 seconds
- **SSE broadcast**: Instant (when new data arrives)

To change update frequency, edit `src/persistence-service.ts`:

```typescript
private readonly PERSIST_INTERVAL_MS = 10000; // Change this value (in milliseconds)
```

Then redeploy:
```bash
fly deploy
```

## Troubleshooting

### Service Won't Start
- Check secrets are set: `fly secrets list`
- Verify Redis URL format includes `redis://` prefix
- Check logs: `fly logs`

### Database Not Updating
- Verify service is running: `fly status`
- Check health endpoint returns all "connected"
- Ensure there are active trades in database
- Check Supabase service role key has proper permissions

### High Memory Usage
- Check Redis connection isn't leaking
- Monitor with: `fly vm status`
- Scale up if needed: `fly scale memory 1024`

### Rate Limits
- Polygon free tier: 5 API calls per minute
- Service makes 12 calls per minute (2 per 10 seconds)
- Upgrade Polygon plan if you hit limits

## Cost Estimate

- **Fly.io**: ~$5-10/month (shared CPU, 512MB RAM)
- **Upstash Redis**: Free tier (10,000 commands/day) or $10/month
- **Polygon.io**: From free (limited) to $199/month (real-time)

Total: ~$15-220/month depending on your Polygon plan

## Alternative: Run Locally

For testing, you can run locally:

```bash
cd realtime-pricing-service

# Create .env file
cat > .env << EOF
POLYGON_API_KEY=your_key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=development
EOF

# Install dependencies
npm install

# Build
npm run build

# Run
npm start

# Or run in dev mode with hot reload
npm run dev
```

## Support

If you encounter issues:
1. Check the logs: `fly logs`
2. Verify health endpoint: `curl https://indices-hub-realtime.fly.dev/health`
3. Test Redis connection: `redis-cli -u $REDIS_URL ping`
4. Check Supabase is accessible from Fly.io region
