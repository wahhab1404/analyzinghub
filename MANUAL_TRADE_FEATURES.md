# Manual Trade Features - Complete Guide

## Overview

Two powerful new features have been added to make trade management easier and faster:

1. **Quick Manual Trade Entry** - Add trades manually with just Index, Strike, Entry, and High
2. **Manual High Adjustment** - Update the high price of any active trade manually

---

## 1. Quick Manual Trade Entry

### What It Does
Allows you to quickly add a trade by entering just the essential information. The system automatically calculates profit in both $ and %.

### Where to Find It
- Go to `/dashboard/indices`
- At the top of the trades list, click the **"Quick Manual Trade"** button

### How to Use

1. Click **"Quick Manual Trade"** button
2. Fill in the form:
   - **Index**: Select SPX, NDX, RUT, or DJI
   - **Direction**: Choose Call or Put
   - **Strike Price**: Enter the strike (e.g., 6900)
   - **Entry Price**: Contract entry price (e.g., 3.50)
   - **High Price**: Highest price reached (e.g., 7.00)

3. **Auto-Calculated Display**:
   - As you type Entry and High, the form automatically shows:
     - **Profit %**: `+100.00%`
     - **Profit $**: `+$350.00`
   
4. Click **"Create Trade"**

### What Happens Behind the Scenes

The system automatically:
- Calculates profit percentage: `((High - Entry) / Entry) * 100`
- Calculates profit in dollars: `(High - Entry) * 100` (multiplier)
- Sets trade status:
  - **Active** if profit < $100
  - **Closed (Winner)** if profit >= $100
- Creates entry snapshot with all contract data
- Sets expiry to 7 days from now
- Marks as `is_manual_entry: true`
- **Disables Telegram notifications** (won't spam channels)

### Example

**Input:**
```
Index: SPX
Direction: Call
Strike: 6900
Entry: 3.50
High: 7.00
```

**Auto-Calculated:**
```
Profit %: +100.00%
Profit $: +$350.00
Status: Closed (Winner) ✅
```

---

## 2. Manual High Adjustment

### What It Does
Allows you to manually update the high price (and optionally current price) of any active trade. Useful when:
- Market is closed (weekends, holidays)
- Price data is delayed
- You want to test $100 milestone notifications
- Need to correct a price manually

### Where to Find It
- On any trade card in the trades list
- Look for the **Edit icon** (✏️) button
- Click it to open the Manual Price Update dialog

### How to Use

1. Click the **Edit icon** on any trade
2. View current trade info:
   - Entry Price
   - Current Price
   - Current High
   - Quantity

3. Update prices (one or both):
   - **Current Price** (Optional): Update the live contract price
   - **New High Price** (Optional): Must be higher than current high

4. See real-time calculations:
   - Shows profit % and $ as you type
   - Displays **WINNER 🎉** badge if profit >= $100
   - Color-coded: Green for gains, Red for losses

5. Click **"Update Prices"**

### What Happens Behind the Scenes

The system automatically:
- Updates `current_contract` and/or `contract_high_since`
- Marks as `is_using_manual_price: true`
- Calls `update_trade_high_watermark()` RPC function
- Detects if this creates a new high
- Detects if trade hits $100 profit milestone (winner)
- **Generates snapshot image** if new high detected
- **Queues Telegram notification** with image
- Recalculates P&L and profit %

### Special Behaviors

**New High Detection:**
- If the new price is higher than previous high
- System generates a beautiful "NEW HIGH ALERT" image
- Sends notification to Telegram with the image
- Image shows: Entry, Current, High, Gain %, P/L $

**Winner Detection:**
- If profit reaches $100 or more
- Automatically marks as winning trade
- Generates winner snapshot
- Sends "WINNER" notification to Telegram

### Example Scenarios

#### Scenario 1: Market Closed Weekend Update
```
Trade: SPX 6900 Call
Entry: $3.50
Current High: $7.00
You saw: Friday close was $8.50

Action: Set Current Price = 8.50
Result: ✅ New high detected! Snapshot generated.
```

#### Scenario 2: Test $100 Milestone
```
Trade: SPX 6880 Call
Entry: $3.95
Current: $4.50 (profit: $55)
You want: To mark as winner at $5.00

Action: Set Current Price = 5.00, Set New High = 5.00
Result: 🎉 WINNER! Profit = $105. Notification sent.
```

---

## Technical Details

### API Endpoints

**Manual Trade Creation:**
```
POST /api/indices/trades/manual
Body: {
  index_symbol: "SPX",
  strike: 6900,
  entry_price: 3.50,
  high_price: 7.00,
  direction: "call"
}
```

**Manual High Update:**
```
POST /api/indices/trades/[id]/manual-price
Body: {
  manualPrice: 8.50,      // Optional
  manualHigh: 9.00        // Optional
}
```

### Database Fields

**Manual Trade Entry:**
- `is_manual_entry: true` - Identifies manually created trades
- `telegram_send_enabled: false` - No auto-notifications
- `entry_contract_snapshot`: Full snapshot with all data

**Manual Price Update:**
- `manual_contract_price` - Stores manual price
- `is_using_manual_price: true` - Flag for manual update
- `contract_high_since` - Updated high watermark
- `current_contract` - Current price

### Calculations

**Profit Percentage:**
```typescript
profitPercent = ((high - entry) / entry) * 100
```

**Profit Dollars:**
```typescript
profitDollars = (high - entry) * 100 * qty
// 100 = contract multiplier
// qty = number of contracts (default: 1)
```

**Winner Threshold:**
```typescript
isWinner = profitDollars >= 100
```

---

## UI Components

### Files Created/Modified

1. **QuickManualTradeDialog.tsx** (NEW)
   - Form for manual trade entry
   - Real-time profit calculations
   - Validation and error handling

2. **ManualHighUpdateDialog.tsx** (EXISTS)
   - Dialog for updating prices manually
   - Shows current trade info
   - Real-time profit preview
   - Winner detection badge

3. **TradesList.tsx** (UPDATED)
   - Added "Quick Manual Trade" button in header
   - Shows trade count
   - Edit button on each trade card
   - Both dialogs integrated

4. **API Routes:**
   - `/app/api/indices/trades/manual/route.ts` (NEW)
   - `/app/api/indices/trades/[id]/manual-price/route.ts` (EXISTS)

---

## Best Practices

### When to Use Quick Manual Trade
✅ Recording historical trades
✅ Adding trades from other platforms
✅ Backtesting scenarios
✅ Testing the system without live data

❌ Don't use for live trades (use New Trade Dialog instead)
❌ Don't use if you want Telegram notifications

### When to Use Manual High Adjustment
✅ Weekend/holiday price updates
✅ Correcting delayed data
✅ Testing winner notifications
✅ Manual milestone marking

❌ Don't use during market hours (auto-tracking works)
❌ Don't abuse for fake wins

---

## Summary

**Quick Manual Trade Entry:**
- Fast trade creation
- Auto-calculates profit
- No Telegram spam
- Perfect for historical data

**Manual High Adjustment:**
- Update prices anytime
- Triggers notifications
- Generates snapshots
- Great for testing

Both features make trade management more flexible and powerful! 🚀
