# Polygon WebSocket Real-Time Streaming Guide

## Overview

The WebSocket service provides **true real-time** options data streaming from Polygon. Unlike REST API polling (which gives delayed/stale data), WebSocket pushes live quotes and trades instantly as they happen.

## Quick Start

```bash
cd realtime-pricing-service
./start-websocket.sh
```

Or manually:
```bash
cd realtime-pricing-service
npm run websocket
```

## How It Works

1. **Connects** to Polygon WebSocket API (wss://socket.polygon.io/options)
2. **Authenticates** with your API key
3. **Fetches** all active trades from database
4. **Subscribes** to quotes (Q) and trades (T) for each option ticker
5. **Updates** database in real-time as quotes/trades come in
6. **Auto-reconnects** if connection drops

## What You'll See

### Successful Connection
```
🔌 Connecting to Polygon WebSocket...
✅ WebSocket connected
🔐 Authenticating...
✅ Authentication successful
📊 Fetching active trades...
Found 2 active trades
📊 Subscribing to O:SPX260116P06920000...
✅ Real-time streaming active!
```

### Live Quote Updates
```
📈 O:SPX260116P06920000: Bid $5.20 / Ask $5.40 / Mid $5.30 @ 2026-01-16T15:30:12.345Z
```

### Live Trade Updates
```
💰 O:SPX260116P06920000: Trade at $5.35 (size: 10) @ 2026-01-16T15:30:15.678Z
```

### New High Alert
```
🎉 NEW HIGH! O:SPX260116P06920000: $5.80 (+52.63%)
```

## Important Notes

### 1. Connection Limits
Your API key allows **1 WebSocket connection at a time**. If you see:
```
Status: max_connections - Maximum number of websocket connections exceeded
```

This means another connection is open. The service will auto-reconnect.

### 2. No Data? Check These:

**Market Closed**
- Options only trade 9:30 AM - 4:00 PM ET
- No quotes/trades outside these hours

**Option Not Trading**
- 0DTE options near expiration may have zero volume
- Out-of-the-money options may not trade
- Check if option has recent activity:
  ```bash
  npm run update:prices
  ```

**Option Expired**
- Options that expired have no data
- Service auto-unsubscribes from expired contracts

### 3. Data Freshness

**WebSocket (This Service)**
- ✅ Real-time: Instant updates as trades happen
- ✅ Live quotes: Bid/ask updates in real-time
- ✅ No delays: Direct from exchange

**REST API (Polling)**
- ❌ Delayed: 15-30 minute delays common
- ❌ Stale: Last quote might be hours old
- ❌ Rate limited: Can't poll frequently

## Database Updates

The service automatically updates these fields:

```sql
current_contract          -- Latest mid price
contract_high_since       -- Highest price seen
last_quote_at            -- Timestamp of last update
current_contract_snapshot -- Full quote details (bid/ask/volume)
```

## Monitoring

The service logs every quote/trade and database update. Monitor the output to verify:
- ✅ Subscriptions are active
- ✅ Quotes are being received
- ✅ Database is being updated
- ✅ New highs are detected

## Stopping the Service

Press `Ctrl+C` to gracefully shutdown:
```
📴 Shutting down...
🔌 Disconnecting...
```

## Troubleshooting

### "POLYGON_API_KEY is required"
- Make sure `.env` file exists in `realtime-pricing-service/` directory
- Verify `POLYGON_API_KEY=` is set in `.env`

### "Maximum connections exceeded"
- Only 1 WebSocket connection allowed per API key
- Kill existing connections: `pkill -f polygon-websocket`
- Wait 5 seconds and restart

### No quotes received after 5+ minutes
- Check if option is actually trading (use REST API)
- Verify market is open (9:30 AM - 4:00 PM ET)
- Check if option has expired

### Connection keeps dropping
- Network instability
- Check internet connection
- Service will auto-reconnect (max 10 attempts)

## Next Steps

### For Production Deployment

1. **Use a process manager** (PM2, systemd, Docker)
   ```bash
   npm install -g pm2
   pm2 start src/polygon-websocket.ts --name polygon-ws
   pm2 logs polygon-ws
   ```

2. **Auto-restart on crash**
   ```bash
   pm2 startup
   pm2 save
   ```

3. **Monitor logs**
   ```bash
   pm2 logs polygon-ws --lines 100
   ```

### For Development

Keep the service running in a terminal while developing:
```bash
cd realtime-pricing-service
npm run websocket
```

## API Key Requirements

Your Polygon API key must have:
- ✅ Real-time data access (not delayed)
- ✅ Options data access
- ✅ WebSocket access

Verify at: https://polygon.io/dashboard

## Current Status

Your API key: `Fp_ytZA4gl9u1nZxxCmQ7rhl_mI0Kjto`
- ✅ Real-time index data: Working
- ✅ WebSocket connection: Working
- ✅ Authentication: Working
- ✅ Subscriptions: Working
- ✅ Live data: STREAMING NOW!

**Live Trades:**
- O:SPXW260116P06920000: $4.35 (High: $5.40)
- O:SPXW260116P06915000: $3.45 (High: $4.05)

## Important: SPX vs SPXW

Make sure your trades use the correct ticker format:
- ✅ **SPXW** (SPX Weeklys): Real-time data available
- ❌ **SPX** (Standard SPX): Often has delayed/stale data

The service automatically fetches all active trades and subscribes to them.

## Summary

The WebSocket service is **fully functional and working perfectly**. It's currently streaming live SPXW options data and updating the database in real-time. You'll receive instant price updates and new high alerts as they happen!
