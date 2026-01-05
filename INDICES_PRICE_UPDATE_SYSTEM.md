# Indices Hub Price Update System

## Overview

The Indices Hub uses a dual-system approach for price updates:

1. **Backend Cron Job** - Updates prices in database every 1 minute
2. **Frontend Polling** - Refreshes display every 5 seconds

## How It Works

### Backend: Cron Job (Every 1 Minute)

The `indices-trade-tracker` edge function runs automatically every 1 minute via pg_cron:

```sql
-- Migration: 20260104115916_fix_trade_tracking_to_1_minute.sql
SELECT cron.schedule(
  'indices-trade-tracker',
  '* * * * *',  -- Every 1 minute (pg_cron minimum)
  ...
);
```

**What it does:**
- Fetches latest prices from Polygon API for all active trades
- Updates `current_contract` and `current_underlying` in database
- Tracks high/low prices since entry
- Checks if targets or stop-loss are hit
- Sends Telegram notifications for new highs or trade closures
- Updates `last_quote_at` timestamp

**Performance:**
- Processes up to 50 active trades per cycle
- Takes ~12 seconds to update 18 trades
- Rate-limited to avoid API quota issues (200ms delay between trades)

### Frontend: Polling (Every 5 Seconds)

The `TradeMonitor` component polls the API every 5 seconds:

```typescript
useEffect(() => {
  fetchTrade()
  const interval = setInterval(fetchTrade, 5000) // 5 seconds
  return () => clearInterval(interval)
}, [tradeId])
```

**What it displays:**
- Current contract price
- Time since last database update (e.g., "23s ago")
- Time since last frontend refresh (e.g., "Refreshed 2s ago")
- "Stale" indicator if data is >2 minutes old
- Price history chart (last 30 updates)

## Checking System Status

### 1. Verify Cron Job is Running

```bash
npx tsx scripts/check-cron-status.ts
```

Expected output:
```
✅ Cron appears to be working! 5 trade(s) updated in last 2 minutes
```

### 2. Manually Trigger Price Update

```bash
npx tsx scripts/test-price-update.ts
```

Expected output:
```
✅ Price update successful!
   - Processed: 18 trades
   - Updated: 18 trades
```

### 3. Check Recent Updates in Database

```sql
SELECT id, last_quote_at, current_contract, status
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC
LIMIT 5;
```

If `last_quote_at` timestamps are recent (within last 2 minutes), the cron is working correctly.

## Update Frequency

| Component | Frequency | Purpose |
|-----------|-----------|---------|
| Cron Job | Every 1 minute | Database updates, alerts, target checking |
| Frontend Poll | Every 5 seconds | Display refresh |
| Timestamp Display | Every 1 second | Shows "Xs ago" updating live |

## Why 1 Minute?

- **pg_cron limitation**: Supabase's pg_cron only supports minimum 1-minute intervals
- **API rate limits**: Polygon API has rate limits; 1-minute intervals prevent quota issues
- **Cost efficiency**: Fewer API calls = lower costs
- **Sufficient for trading**: 1-minute updates are acceptable for options trading

## Future Improvements

For true real-time updates (5-second intervals), consider:

1. **Realtime Pricing Service**: Deploy the `realtime-pricing-service` that uses Server-Sent Events (SSE)
2. **WebSocket Connection**: Use Supabase Realtime to broadcast price changes
3. **Client-side Polygon API**: Poll Polygon directly from frontend (requires exposing API key)

## Troubleshooting

### Prices Not Updating

1. Check if cron job is running: `npx tsx scripts/check-cron-status.ts`
2. Check Polygon API key is configured in Supabase edge function secrets
3. Check if trades are actually active (not closed/cancelled)
4. Manually trigger update: `npx tsx scripts/test-price-update.ts`

### "Stale" Indicator Showing

- If prices show "Stale" (>2 minutes old), the cron may have stopped
- Check Supabase edge function logs for errors
- Verify Polygon API key is valid and has available quota

### Frontend Not Refreshing

- Check browser console for API errors
- Verify the trade ID is correct
- Check if you're authenticated (required to view trades)
- Hard refresh the page (Ctrl+Shift+R)
