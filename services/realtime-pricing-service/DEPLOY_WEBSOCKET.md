# Deploy Real-time WebSocket Service

This deploys the Polygon WebSocket service that updates trades **in real-time** (every few seconds) instead of every 1 minute.

## Quick Deploy to Fly.io

### 1. Install Fly CLI
```bash
# Mac/Linux
curl -L https://fly.io/install.sh | sh

# Windows PowerShell
iwr https://fly.io/install.ps1 -useb | iex
```

### 2. Login to Fly
```bash
fly auth login
```

### 3. Deploy the Service
```bash
cd realtime-pricing-service

# Install dependencies
npm install

# Create Fly app (one-time)
fly launch --name indices-hub-realtime --region iad --no-deploy

# Set secrets
fly secrets set \
  POLYGON_API_KEY=your_polygon_api_key \
  SUPABASE_URL=https://gbdzhdlpbwrnhykmstic.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8 \
  REDIS_URL=redis://your_upstash_redis_url

# Deploy
fly deploy
```

### 4. Check Status
```bash
fly status
fly logs
```

## Alternative: Simple WebSocket Script

If you don't want to deploy the full service, use the simpler standalone script:

### 1. Create Dockerfile for WebSocket Only
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY src/polygon-websocket.ts ./
RUN npm install -g ts-node
CMD ["ts-node", "polygon-websocket.ts"]
```

### 2. Deploy to Fly.io
```bash
fly launch --dockerfile Dockerfile.websocket
fly deploy
```

## What This Does

Once deployed, the service will:
1. ✅ Connect to Polygon WebSocket API
2. ✅ Subscribe to all active option trades
3. ✅ Receive price updates every few seconds
4. ✅ Update `index_trades` table in real-time
5. ✅ Detect new highs immediately
6. ✅ Update contract_high_since automatically

## Monitoring

```bash
# View logs
fly logs

# SSH into machine
fly ssh console

# Check health
curl https://indices-hub-realtime.fly.dev/health
```

## Cost

Fly.io free tier includes:
- Up to 3 shared-cpu VMs
- 256MB RAM each
- 3GB outbound data transfer/month

This service uses ~512MB RAM and should stay within free tier.

## Redis Setup (Required)

The service needs Redis for state management. Use Upstash (free tier):

1. Go to https://upstash.com
2. Create free Redis database
3. Copy the Redis URL
4. Add to Fly secrets: `fly secrets set REDIS_URL=redis://...`

## Troubleshooting

### Service not connecting to Polygon
- Check `POLYGON_API_KEY` is valid
- Check Polygon subscription includes options data
- View logs: `fly logs`

### Database not updating
- Check `SUPABASE_SERVICE_ROLE_KEY` is correct
- Verify RLS policies allow service_role updates
- Check trade status is 'active'

### High memory usage
- Reduce number of subscribed tickers
- Increase VM memory: `fly scale memory 1024`
