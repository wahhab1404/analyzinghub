# Snapshot Generation Fixed for Trade Images

## Problem

Pictures (snapshots) were not being sent to Telegram for:
1. **New trades** - When a trade is first created
2. **New highs** - When a trade reaches a significant new high (5%+ gain)

The system was **generating** the snapshots but **not saving the URLs to the database**, so when Telegram messages were sent, they had no image attached.

## Root Cause

When snapshots were generated, the system updated the `contract_url` field **in memory only** but never saved it back to the database. This caused:
- Telegram messages to be sent without images
- The trade tracker to lose track of snapshot URLs
- Users to not see visual updates in their Telegram channels

## What Was Fixed

### 1. New Trade Creation (Both Standalone & Analysis)
**Files Modified:**
- `/app/api/indices/analyses/[id]/trades/route.ts`
- `/app/api/indices/trades/route.ts`

**Fix:** After generating a snapshot, the system now **saves the URL to the database**:
```typescript
// Generate snapshot
const result = await snapshotResponse.json();
snapshotUrl = result.imageUrl;
trade.contract_url = snapshotUrl;

// NEW: Save to database immediately
await supabase
  .from('index_trades')
  .update({ contract_url: snapshotUrl })
  .eq('id', trade.id);
```

### 2. New High Detection
**File Modified:**
- `/supabase/functions/indices-trade-tracker/index.ts`

**Fix:** When a trade reaches a new high (5%+ gain), the snapshot URL is now saved:
```typescript
// Generate snapshot for new high
const snapshotResult = await snapshotResponse.json();
snapshotUrl = snapshotResult.imageUrl;

// NEW: Save to database immediately
await supabase
  .from("index_trades")
  .update({ contract_url: snapshotUrl })
  .eq("id", trade.id);
```

### 3. Winning Trade Detection ($100+ Profit)
**File Modified:**
- `/supabase/functions/indices-trade-tracker/index.ts`

**Fix:** When a trade reaches $100+ profit milestone:
- During market hours
- After market hours

Both scenarios now save the snapshot URL to the database.

### 4. Trade Result (Target/Stop Loss Hit)
**File Modified:**
- `/supabase/functions/indices-trade-tracker/index.ts`

**Fix:** When a trade closes (target or stop loss hit), the snapshot URL is saved.

## How to Deploy

### Step 1: Deploy the Edge Function

The trade tracker edge function needs to be redeployed with the fixes:

```bash
# Deploy the updated trade tracker
npx supabase functions deploy indices-trade-tracker --no-verify-jwt
```

### Step 2: Test with a New Trade

1. Go to **Dashboard → Indices**
2. Create or open an analysis
3. Click **"Add Trade"**
4. Fill in the trade details
5. Enable **"Auto-publish to Telegram"**
6. Submit the trade

### Step 3: Verify

**Check that:**
1. ✅ The trade is created successfully
2. ✅ A snapshot image appears in the trade details
3. ✅ The Telegram message includes the snapshot image
4. ✅ When the trade reaches a new high, the updated snapshot is sent

## Expected Behavior After Fix

### New Trade Creation:
```
📊 NEW TRADE
SPX 6000 Call
Entry: $15.50
Target: $20.00 (+29.03%)
Stop Loss: $12.00 (-22.58%)
[Snapshot Image Attached]
```

### New High:
```
🚀 NEW HIGH!
SPX 6000 Call
New High: $18.25 (+17.74%)
[Updated Snapshot Image Attached]
```

### Winning Trade:
```
🎉 WINNING TRADE!
Net Profit: $125.50
Entry: $15.50 → Current: $27.00
[Snapshot Image Attached]
```

## Files Modified

1. `/app/api/indices/analyses/[id]/trades/route.ts` (Lines 340-343)
2. `/app/api/indices/trades/route.ts` (Lines 318-321)
3. `/supabase/functions/indices-trade-tracker/index.ts` (4 locations):
   - New high detection (Lines 421-424)
   - Winning trade detection (Lines 366-369)
   - After-close winning trade (Lines 144-147)
   - Trade result (Lines 488-491)

## Testing Checklist

- [ ] New trade creation sends snapshot to Telegram
- [ ] New high detection sends updated snapshot
- [ ] Winning trade ($100+) sends snapshot
- [ ] Trade results (TP/SL) send final snapshot
- [ ] All snapshots are visible in the dashboard
- [ ] Database `contract_url` field is populated

## Notes

- Snapshots are now saved to the database **immediately** after generation
- This ensures Telegram messages always have the latest snapshot image
- The system tracks price changes every minute during market hours
- Significant new highs (5%+) trigger snapshot regeneration and Telegram updates
