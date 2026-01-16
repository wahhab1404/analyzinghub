# Deploy Polygon WebSocket Service to Render

## Step 1: Create New Web Service

1. Go to https://render.com/dashboard
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select your repo

## Step 2: Configure Service

**IMPORTANT: Point to the subdirectory**

- **Name**: `indices-websocket-service`
- **Region**: Choose closest to you
- **Root Directory**: `realtime-pricing-service` ← **CRITICAL!**
- **Environment**: `Node`
- **Branch**: `main`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run websocket`

## Step 3: Environment Variables

Add these environment variables:

```
POLYGON_API_KEY=your_polygon_api_key
NEXT_PUBLIC_SUPABASE_URL=https://gbdzhdlpbwrnhykmstic.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZHpoZGxwYndybmh5a21zdGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2ODg1NywiZXhwIjoyMDgxNzQ0ODU3fQ.ehyIXF8c0fl3itXafBcS_jZQlgAElZLHatpCf7eH_H8
NODE_ENV=production
```

## Step 4: Service Plan

- **Instance Type**: Free (sufficient for WebSocket service)
- The free tier includes 750 hours/month

## Step 5: Deploy

Click **"Create Web Service"**

The service will:
1. Install dependencies
2. Build TypeScript files
3. Start the WebSocket connection to Polygon
4. Subscribe to all active trades
5. Update database in real-time (every 2-5 seconds)

## Verify It's Working

After deployment, check logs in Render dashboard. You should see:

```
🔌 Connecting to Polygon WebSocket...
✅ WebSocket connected
🔐 Authenticating...
✅ Authentication successful
📊 Fetching active trades...
Found 5 active trades
📊 Subscribing to O:SPX251231C06100000...
✅ Real-time streaming active!
💓 Connection alive, subscribed to 5 tickers
📈 O:SPX251231C06100000: Bid $82.50 / Ask $83.00 / Mid $82.75
```

## What This Does

Once running:
- ✅ Real-time price updates every 2-5 seconds
- ✅ Automatic new high detection
- ✅ Instant Telegram notifications
- ✅ No more 1-minute delays

## Troubleshooting

### "Module not found" errors
- Make sure **Root Directory** is set to `realtime-pricing-service`
- Check that Build Command is `npm install && npm run build`

### WebSocket not connecting
- Verify `POLYGON_API_KEY` is correct
- Check your Polygon subscription includes options data
- View logs in Render dashboard

### Database not updating
- Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
- Check RLS policies allow service_role updates
- Ensure trades have `status = 'active'`

## Alternative: Run Locally for Testing

```bash
cd realtime-pricing-service
npm install

# Create .env file
cat > .env << EOF
POLYGON_API_KEY=your_key
NEXT_PUBLIC_SUPABASE_URL=https://gbdzhdlpbwrnhykmstic.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
EOF

# Run WebSocket service
npm run websocket
```

## Cost

Render free tier includes:
- 750 hours/month (enough for 24/7 operation)
- 512MB RAM
- Shared CPU

Perfect for this WebSocket service!
