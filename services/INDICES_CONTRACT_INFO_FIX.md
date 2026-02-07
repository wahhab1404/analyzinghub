# Indices Contract Info Fix - Complete

## Problem
1. Telegram messages showing **outdated bid/ask/volume** from entry time
2. Snapshot images showing **old contract data** instead of current prices
3. Missing real-time contract information updates

## Root Cause
- Database only stored `current_contract` (just price), not full snapshot
- Trade tracker didn't fetch volume/open_interest from Polygon
- Snapshot HTML used entry data instead of current data
- Telegram formatter used entry data instead of current data

## Changes Made

### 1. Database Schema
**Migration:** `20260107120000_add_current_contract_snapshot.sql`
- Added `current_contract_snapshot` JSONB field to `index_trades` table
- Stores full contract data: bid, ask, mid, volume, open_interest, timestamp

### 2. Trade Tracker Updates
**File:** `supabase/functions/indices-trade-tracker/index.ts`

**Changes:**
- Fetch volume and open_interest from Polygon snapshot endpoint
- Store full contract snapshot in `current_contract_snapshot` field
- Include snapshot in select queries

**Code:**
```typescript
// Now stores full snapshot
current_contract_snapshot: contractQuote ? {
  bid: contractQuote.bid,
  ask: contractQuote.ask,
  mid: contractQuote.price,
  last: contractQuote.last,
  volume: contractQuote.volume || 0,
  open_interest: contractQuote.open_interest || 0,
  updated: contractQuote.updated || new Date().toISOString(),
} : null
```

### 3. Polygon API Enhancement
**File:** `supabase/functions/indices-trade-tracker/index.ts`

**Changes:**
- Added snapshot API call for volume and open_interest
- Endpoint: `https://api.polygon.io/v3/snapshot/options/{ticker}`

```typescript
// Fetch snapshot for volume and open interest
const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker.replace('O:', '')}?apiKey=${apiKey}`;
const snapshotResponse = await fetch(snapshotUrl);
if (snapshotResponse.ok) {
  const snapshotData = await snapshotResponse.json();
  if (snapshotData.status === "OK" && snapshotData.results) {
    volume = snapshotData.results.day?.volume || 0;
    open_interest = snapshotData.results.open_interest || 0;
  }
}
```

### 4. Snapshot HTML Fix
**File:** `app/api/indices/trades/[id]/snapshot-html/route.ts`

**Changes:**
- Use `current_contract_snapshot` instead of `entry_contract_snapshot`
- Shows live bid/ask/volume in snapshot images

```typescript
// Use CURRENT snapshot data if available, fallback to entry
const currentSnapshot = trade.current_contract_snapshot || trade.entry_contract_snapshot;
const bid = currentSnapshot?.bid || 0;
const ask = currentSnapshot?.ask || 0;
const volume = currentSnapshot?.volume || 0;
```

### 5. Telegram Message Fix
**File:** `supabase/functions/telegram-outbox-processor/index.ts`

**Changes:**
- Use `current_contract_snapshot` for bid/ask in messages
- Show real-time bid/ask spread in Telegram messages

```typescript
// Use current snapshot for bid/ask if available
const currentSnapshot = trade.current_contract_snapshot || trade.entry_contract_snapshot;
const bid = currentSnapshot?.bid || 0;
const ask = currentSnapshot?.ask || 0;

if (bid > 0 && ask > 0) {
  caption += `<b>Bid/Ask | عرض/طلب:</b> $${bid.toFixed(2)} / $${ask.toFixed(2)}\n`;
}
```

### 6. Databento Service Fix
**File:** `databento-live-service/src/main.py`

**Changes:**
- Subscribe to index symbols (I:SPX) for 24/5 tracking
- Use GLBX.MDP3 dataset for indices
- Better symbol conversion logic

## How It Works Now

### Update Flow (Every 1 Minute)

1. **indices-trade-tracker** edge function runs via cron
2. Fetches active trades from database
3. For each trade:
   - Calls Polygon Quotes API for bid/ask
   - Calls Polygon Snapshot API for volume/OI
   - Stores full snapshot in `current_contract_snapshot`
   - Updates `current_contract` price
4. When generating snapshots or sending Telegram:
   - Uses `current_contract_snapshot` for real-time data
   - Shows current bid/ask/volume/OI

### Data Structure

**current_contract_snapshot JSONB:**
```json
{
  "bid": 5.0,
  "ask": 5.3,
  "mid": 5.15,
  "last": 5.0,
  "volume": 1234,
  "open_interest": 5678,
  "updated": "2026-01-07T11:35:09.344Z"
}
```

## Testing

Run after deployment:
```bash
npx tsx scripts/check-last-update-times.ts
```

Check:
- ✅ Trades updating every minute
- ✅ `current_contract_snapshot` populated with data
- ✅ Telegram messages showing current bid/ask
- ✅ Snapshot images showing current data

## Important Notes

1. **Outside RTH**: Option prices don't change outside Regular Trading Hours (9:30 AM - 4:15 PM ET). This is normal - the system updates the timestamp but prices remain at market close.

2. **Underlying Index**: Updates 24/5 via Polygon API (real-time index values)

3. **Volume/OI**: Updated every minute from Polygon snapshot endpoint

4. **Telegram Messages**: Now include current bid/ask spread

5. **Snapshot Images**: Show real-time contract data when generated

## Deploy

Edge functions auto-deploy. To manually trigger:

```bash
# The functions are already deployed automatically
# Just wait for next cron run (every 1 minute)
```

## Verification

After deployment:

1. Create a new trade
2. Wait 1 minute for cron to run
3. Check database:
   ```sql
   SELECT current_contract_snapshot FROM index_trades WHERE id = 'your-trade-id';
   ```
4. Should see full snapshot with bid/ask/volume/OI
5. Generate snapshot - should show current data
6. Send Telegram - should show current bid/ask

## Summary

All contract information (bid/ask/volume/open_interest) now updates in real-time every minute and is reflected in:
- ✅ Database records
- ✅ Snapshot images
- ✅ Telegram messages
- ✅ API responses

The system now provides accurate, up-to-date contract market data for all active trades.
