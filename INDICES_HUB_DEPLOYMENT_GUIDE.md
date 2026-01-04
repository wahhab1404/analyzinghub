# Indices Hub - Deployment Guide

Complete guide for deploying the Indices Hub system to production.

## Prerequisites

1. **Polygon.io Account**
   - Sign up at https://polygon.io
   - Get API key (Starter plan minimum: $199/month)
   - Verify indices and options data access

2. **Upstash Redis Account**
   - Sign up at https://upstash.com
   - Create Redis database
   - Copy connection URL

3. **Fly.io Account** (or Render/Railway)
   - Sign up at https://fly.io
   - Install flyctl CLI
   - Login: `flyctl auth login`

4. **Supabase Project**
   - Already configured with database

5. **Netlify Account**
   - Already configured for main app

## Deployment Steps

### 1. Apply Database Migrations

The migration has already been applied, but verify:

```bash
# Check if tables exist
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'index%';"

# Should show:
# - indices_reference
# - index_analyses
# - index_trades
# - analysis_updates
# - trade_updates
```

### 2. Set Up Redis (Upstash)

1. Go to https://console.upstash.com
2. Create new Redis database
   - Name: `indices-hub-realtime`
   - Region: Choose closest to your Fly.io region
   - Type: Regional (not global)
3. Copy the Redis URL (format: `redis://default:xxx@xxx.upstash.io:6379`)

### 3. Deploy Realtime Pricing Service to Fly.io

```bash
cd realtime-pricing-service

# Install dependencies
npm install

# Build locally to verify
npm run build

# Initialize Fly.io app
fly launch

# Follow prompts:
# - App name: indices-hub-realtime
# - Region: us-east (or closest to users)
# - Do not deploy yet: N

# Set secrets
fly secrets set POLYGON_API_KEY=your_polygon_key
fly secrets set SUPABASE_URL=https://your-project.supabase.co
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
fly secrets set REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
fly secrets set JWT_SECRET=your_supabase_jwt_secret

# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs

# Check health
curl https://indices-hub-realtime.fly.dev/health
```

### 4. Configure Netlify Environment Variables

Add to Netlify environment variables:

```
POLYGON_API_KEY=your_polygon_key
REALTIME_SERVICE_URL=https://indices-hub-realtime.fly.dev
```

### 5. Test the Integration

#### Test 1: Create Analysis
```bash
# Login to your app
# Navigate to Indices Hub (to be built in UI)
# Create a new analysis with chart
# Verify it saves to database
```

#### Test 2: Publish Trade
```bash
# From analysis page, click "New Trade"
# Select options contract
# Publish trade
# Verify:
# - Trade shows in database with entry snapshots
# - status = 'active'
# - entry_underlying_snapshot has price
# - entry_contract_snapshot has mid price
```

#### Test 3: Live Updates
```bash
# Open browser console
# Navigate to analysis detail page
# Check Network tab for EventStream connection to realtime service
# Verify SSE events are received:
# - snapshot event on connect
# - update events with live prices
# - heartbeat events every 30s
```

### 6. Monitor and Verify

#### Check Realtime Service Health
```bash
curl https://indices-hub-realtime.fly.dev/health

# Expected response:
# {
#   "status": "ok",
#   "redis": "connected",
#   "supabase": "connected",
#   "polygon": "connected",
#   "uptime": 123,
#   "activeConnections": 0,
#   "activeSubscriptions": 0
# }
```

#### Check Redis Data
```bash
# Connect to Redis
redis-cli -u $REDIS_URL

# Check keys
KEYS *

# Should see patterns like:
# - quote:I:SPX
# - trade:{uuid}:underlying:high
# - sub:analysis:{uuid}:viewers
```

#### Monitor Logs
```bash
# Fly.io logs
fly logs -a indices-hub-realtime

# Look for:
# - "Polygon WebSocket connected"
# - "SSE connection established"
# - "Successfully persisted X trades"
```

## Performance Tuning

### 1. Polygon Rate Limits

If you hit rate limits:

**Option A: Reduce polling frequency**
```typescript
// In polygon-fetcher.ts
private readonly REST_POLL_INTERVAL_MS = 10000; // Change from 5s to 10s
```

**Option B: Upgrade Polygon plan**
- Advanced plan: $399/month (50 calls/sec)
- Enterprise: Custom pricing

### 2. Redis Memory

Monitor Redis memory usage:
```bash
redis-cli -u $REDIS_URL INFO memory
```

If approaching limits:
- Reduce TTLs (currently 5min = 300s)
- Upgrade Upstash plan
- Implement LRU eviction

### 3. Fly.io Scaling

Scale vertically:
```bash
fly scale vm shared-cpu-2x --memory 1024
```

Scale horizontally (requires sticky sessions):
```bash
fly scale count 2

# Configure load balancer for sticky sessions
# Add to fly.toml:
[http_service]
  [[http_service.http_options]]
    response.headers.X-Fly-Request-Id = true
```

## Troubleshooting

### Issue: SSE connections drop after 60s

**Cause**: Reverse proxy timeout (Cloudflare, nginx)

**Solution**:
- Fly.io: Already configured for long connections
- If behind Cloudflare: Upgrade to Pro plan or disable proxy for realtime subdomain

### Issue: Polygon WebSocket disconnects frequently

**Cause**: Network instability or Polygon maintenance

**Solution**:
- Service auto-reconnects after 5s
- Verify with logs: `fly logs | grep "WebSocket"`
- If persistent, contact Polygon support

### Issue: High Redis memory usage

**Cause**: Too many trades or quotes cached

**Solution**:
```bash
# Clear all quotes (they'll regenerate)
redis-cli -u $REDIS_URL --scan --pattern 'quote:*' | xargs redis-cli -u $REDIS_URL del

# Clear closed trades
redis-cli -u $REDIS_URL --scan --pattern 'trade:*' | while read key; do
  # Check if trade is still active in Supabase
  # If not, delete from Redis
done
```

### Issue: Trades not updating

**Check 1**: Verify Polygon connection
```bash
curl https://indices-hub-realtime.fly.dev/health
# Check "polygon": "connected"
```

**Check 2**: Verify Redis keys exist
```bash
redis-cli -u $REDIS_URL GET "trade:{tradeId}:underlying:current"
# Should return a number
```

**Check 3**: Check Fly.io logs
```bash
fly logs -a indices-hub-realtime | grep -E "Error|Polygon"
```

## Security Checklist

- [ ] Polygon API key only in server environments (Netlify + Fly.io)
- [ ] Supabase Service Role key only in Realtime Service
- [ ] Redis URL not exposed to client
- [ ] RLS policies enabled and tested
- [ ] JWT validation working on SSE endpoint
- [ ] CORS configured correctly
- [ ] Rate limiting enabled (Fly.io handles DDoS)

## Cost Breakdown

**Monthly Costs (Estimated)**:

| Service | Plan | Cost |
|---------|------|------|
| Polygon.io | Starter | $199 |
| Fly.io | 1x shared-cpu-1x, 512MB | $3 |
| Upstash Redis | 10k commands/day | $5 |
| Supabase | Pro | $25 |
| Netlify | Pro (optional) | $19 |
| **Total** | | **~$251/month** |

**Cost Optimizations**:
- Use Supabase free tier if <500MB DB
- Use Fly.io free tier (3 shared-cpu-1x apps free)
- Reduce Polygon polling to minimize API calls

## Backup and Recovery

### Backup Strategy

1. **Database**: Supabase automatic backups (daily)
2. **Redis**: No backups needed (ephemeral cache)
3. **Code**: Git repository

### Recovery Procedure

If Realtime Service goes down:
1. App continues to work with last persisted values
2. No live updates until service recovers
3. On restart, service fetches latest from Supabase and resumes

### Disaster Recovery

1. **Database corruption**: Restore from Supabase backup
2. **Redis failure**: Service continues with degraded performance (REST-only)
3. **Polygon outage**: Service serves stale data from Redis cache

## Monitoring Dashboard

Set up monitoring (optional but recommended):

**Grafana Cloud** (free tier):
- Fly.io metrics integration
- Redis metrics via Upstash API
- Custom application metrics

**Metrics to track**:
- Active SSE connections
- Polygon API calls per minute
- Redis operations per second
- Average SSE latency
- Error rates

**Alerts**:
- Realtime service down (health check fails)
- Polygon rate limit hit
- Redis connection errors
- High memory usage (>80%)

## Next Steps

After deployment:
1. Create frontend UI (see INDICES_HUB_FRONTEND_GUIDE.md)
2. Set up monitoring and alerts
3. Run load tests (see INDICES_HUB_LOAD_TESTING.md)
4. Document user flows
5. Train content creators (analysts)

## Support

For issues:
1. Check Fly.io logs: `fly logs`
2. Check health endpoint: `curl https://indices-hub-realtime.fly.dev/health`
3. Review Redis keys: `redis-cli -u $REDIS_URL KEYS *`
4. Check Supabase logs in dashboard
5. Verify Polygon API status: https://status.polygon.io

## Appendix: Useful Commands

```bash
# Fly.io
fly ssh console  # SSH into container
fly scale show   # Show current scaling
fly releases     # Show deployment history
fly rollback     # Rollback to previous version

# Redis
redis-cli -u $REDIS_URL PING
redis-cli -u $REDIS_URL INFO stats
redis-cli -u $REDIS_URL DBSIZE

# Supabase
psql $DATABASE_URL -c "SELECT COUNT(*) FROM index_trades WHERE status = 'active';"
psql $DATABASE_URL -c "SELECT * FROM index_analyses ORDER BY created_at DESC LIMIT 5;"
```
