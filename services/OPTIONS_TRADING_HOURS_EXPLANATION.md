# Options Trading Hours - Price Update Explanation

## Issue Reported
User reported that contract prices (e.g., 6920 PUT) are not updating outside Regular Trading Hours (RTH).

## Root Cause
**This is NOT a bug - it's expected behavior.**

Options contracts only trade during specific hours:
- **Regular Trading Hours (RTH)**: 9:30 AM - 4:00 PM ET, Monday-Friday
- **Limited Extended Hours**: Some options may have after-hours trading until 5:00 PM ET

**Outside these hours, options do NOT trade**, so there are no new price quotes available.

## How The System Works

### 1. Cron Job (Every Minute)
- The `indices-trade-tracker` edge function runs every 1 minute
- It fetches the latest quotes from Polygon API for all active trades
- Updates the database with current prices

### 2. Outside RTH Behavior
When markets are closed:
- Polygon API returns the **last available quote** from the most recent trading session
- This is typically from the 4:00 PM ET market close
- The system continues to fetch these quotes every minute
- The `last_quote_at` timestamp updates (showing the system is working)
- But the **price remains the same** because no new trading has occurred

### 3. Diagnostic Results
From `diagnose-trade-updates.ts`:
```
Trade: O:SPXW260107P06920000 (6920 PUT)
Entry Price: $4.45
Current Price: $4.45  ← No change (expected outside RTH)
Last Updated: Just now ✅  ← System IS working
```

## Changes Made

### 1. Added Market Hours Alert
Updated `TradesList.tsx` to show a prominent alert when markets are closed:

```tsx
{!marketStatus.isOpen && (
  <Alert>
    <Info className="h-4 w-4" />
    <AlertDescription>
      <Badge variant="outline" className="border-yellow-500">
        <CircleDot className="h-3 w-3" />
        {marketStatus.message}
      </Badge>
      Options prices update during Regular Trading Hours (9:30 AM - 4:00 PM ET).
      Current prices reflect the last available quote from the most recent trading session.
      Current time: {formatMarketTime()}
    </AlertDescription>
  </Alert>
)}
```

### 2. Market Status Badge
The `TradeMonitor` component already had a market status badge:
- Green badge: "Markets open" (during RTH)
- Yellow badge: "Markets closed" / "Pre-market hours" / "After-hours trading"

## When Will Prices Update?

Prices will update in real-time when:
1. Markets are open (9:30 AM - 4:00 PM ET, Monday-Friday)
2. New trades execute on the exchange
3. Bid/ask quotes change

Outside these hours, the displayed prices are the **last valid quotes** from the market close.

## Verification Commands

To verify the system is working:

```bash
# Check active trades and their last update times
npx tsx scripts/diagnose-trade-updates.ts

# Check a specific trade
npx tsx scripts/diagnose-trade-updates.ts <trade-id-or-ticker>

# Manually trigger the trade tracker
# (This is done automatically by cron every minute)
```

## User Education

Users should understand:
1. **Options are NOT like crypto** - they don't trade 24/7
2. Price updates only occur during trading hours
3. Outside RTH, displayed prices are the last available quotes
4. The system IS working correctly - it's updating the `last_quote_at` timestamp
5. Watch the market hours indicator to know when prices will change

## Technical Details

### Polygon API Endpoints Used
- **Options Quotes**: `/v3/quotes/{ticker}?order=desc&limit=1`
- **Index Snapshots**: `/v3/snapshot?ticker.any_of={ticker}`

Both endpoints return the most recent data available, which outside RTH is from the last trading session.

### Database Updates
Even when prices don't change, the system updates:
- `last_quote_at`: Timestamp of the last check (updates every minute)
- `current_contract`: Current price (may not change outside RTH)
- `current_underlying`: Current index value (may not change outside RTH)

This ensures the system is always monitoring and ready to detect changes when markets reopen.
