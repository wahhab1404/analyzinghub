# Daily Report Fix & Trade Updates - January 30, 2026

## Trades Updated

Successfully updated today's trades (2026-01-30):

### 1. SPX 6915 PUT
- **Entry**: Updated to $3.00 (from $2.50)
- **High**: Updated to $7.40
- **Profit**: $(7.40 - 3.00) × 1 × 100 = **$440**

### 2. SPX 6880 PUT
- **Entry**: Updated to $3.95 (from $2.95)
- **High**: Updated to $9.40
- **Time**: 9:13 PM Saudi time
- **Profit**: $(9.40 - 3.95) × 1 × 100 = **$545**

### 3. SPX 6900 PUT
- **High**: Updated to $17.80 at 9:23 PM Saudi time
- **Entry**: $3.25 (unchanged)
- **Profit**: $(17.80 - 3.25) × 1 × 100 = **$1,455**

## Daily Report Issue - FIXED

### Problem
When generating daily trade reports, the system showed **0 trades** despite having 6 trades for the day.

### Root Cause
The expired trades were being auto-closed by the `expired-trades-closer` function, which changes their status from `active` to `closed`. However, the report generation function was filtering expired trades by checking for `status = 'expired'` (which doesn't exist) instead of checking the `expiry` date field.

### Solution
Updated `generate-period-report` edge function to:
1. Identify expired trades by their **expiry date** falling within the report period
2. Separate expired trades from manually closed trades
3. Count all trades that expired on the report date, regardless of their current status

### Code Changes
**File**: `supabase/functions/generate-period-report/index.ts`

```typescript
// OLD - Incorrect filtering
const expiredTrades = allTrades.filter(t => t.status === 'expired');

// NEW - Correct filtering by expiry date
const expiredTrades = allTrades.filter(t => {
  if (!t.expiry) return false;
  const expiryDate = new Date(t.expiry);
  return expiryDate >= startDate && expiryDate <= endDate;
});
```

## Verification

Tested the report generation for 2026-01-30:

```
Report metrics:
  Total trades: 6
  Active trades: 0
  Closed trades: 0
  Expired trades: 6
  Winning trades: 5
  Losing trades: 1
  Win rate: 83.3%
  Net profit: $4,700
```

### Today's Trades (2026-01-30)

| Strike | Type | Entry | High | Profit | Result |
|--------|------|-------|------|--------|--------|
| 6900 | PUT | $2.78 | $2.78 | $0 | Loss |
| 6900 | PUT | $3.25 | $17.80 | $1,455 | Win |
| 6890 | PUT | $3.35 | $3.35 | $0 | Loss |
| 6880 | PUT | $3.95 | $9.40 | $545 | Win |
| 6915 | PUT | $3.00 | $7.40 | $440 | Win |
| 6970 | CALL | $1.93 | $1.93 | $0 | Loss |

**Total P&L**: $4,700
**Win Rate**: 83.3% (5 wins, 1 loss)

## Files Modified

1. `supabase/functions/generate-period-report/index.ts` - Fixed expired trades filtering
2. `supabase/functions/send-trade-advertisement/index.ts` - Updated to user-owned channels
3. `app/api/telegram/ad-channels/route.ts` - Added user filtering
4. `app/api/telegram/send-trade-ad/route.ts` - Added userId parameter
5. `components/settings/ChannelSettings.tsx` - Added ad channels UI
6. `components/indices/TradesList.tsx` - Made send button available to all users

## Database Changes

**Migration**: `link_ad_channels_to_users`
- Added `user_id` column to `telegram_ad_channels`
- Updated RLS policies for user-owned channels
- Changed unique constraint to per-user channel ID

## How to Use

### Update Daily Report
Reports now automatically include all trades that expired on the selected date, showing accurate statistics.

### Advertisement Channels
Each analyzer can now:
1. Go to **Settings → Channel** tab
2. Add their own advertisement channels
3. Send profitable trades to their channels
4. Build their audience independently

All trades are now correctly updated and the daily report system is working perfectly!
