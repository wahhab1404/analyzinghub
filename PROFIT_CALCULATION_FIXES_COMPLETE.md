# Profit Calculation Fixes - Complete Implementation

## Overview
All profit calculations have been updated to use **max profit from entry to highest price** instead of close price. This ensures accurate tracking of trading performance.

---

## Changes Made

### 1. Telegram Notifications - Trade Close Messages ✅

**Files Updated:**
- `supabase/functions/indices-telegram-publisher/message-formatter.ts`
- `supabase/functions/telegram-outbox-processor/index.ts`

**Changes:**
- Updated `formatTradeResultMessage()` to calculate profit from entry to highest price
- Now shows:
  - Entry Price
  - Highest Price (the actual high reached)
  - Close Price (for reference)
  - **Max Profit** = (Highest - Entry) × 100 per contract
- Messages now correctly display profit based on the highest price reached, not the closing price

**Example Output:**
```
🎉 TRADE CLOSED - TARGET HIT!

Index: SPX
Direction: CALL
Strike: $6915
Entry: $2.48
Highest Price: $3.50
Close Price: $3.20

💰 Max Profit: +$102.00 (+41.13%) ✅
```

---

### 2. Expired Trades Closer ✅

**File Updated:**
- `supabase/functions/expired-trades-closer/index.ts`

**Changes:**
- Updated to send proper Telegram notifications using `trade_result` message type
- Calculates profit from entry to highest price (max_profit)
- Fetches analyzer's Telegram channel from `analyzer_plans` table
- Queues message in `telegram_outbox` for reliable delivery

**Logic:**
- For winning trades (max_profit ≥ $100): Uses highest price for profit calculation
- For losing trades (max_profit < $100): Total loss = entry investment
- Outcome is determined by whether max_profit reached $100 threshold

---

### 3. Trading Performance Section ✅

**File Updated:**
- `app/api/profiles/[id]/trading-stats/route.ts`

**Changes:**
- Recalculates all statistics using max profit from entry to highest price
- Formula: `calculatedMaxProfit = (highestPrice - entryPrice) × qty × 100`
- Winning trades: Those with `calculatedMaxProfit ≥ $100`
- All statistics now accurately reflect maximum potential profit achieved

**Metrics Calculated:**
- Total Closed Trades
- Winning Trades (max profit ≥ $100)
- Losing Trades (max profit < $100)
- Win Rate %
- Total Profit (sum of all max profits)
- Average Win
- Average Loss
- Max Profit
- Max Loss

---

### 4. Daily PDF Trading Report ✅

**File Updated:**
- `supabase/functions/generate-daily-pdf-report/index.ts`

**Changes:**

#### A. Profit Calculations
- All trades now calculate profit from entry to highest price
- Win rate based on $100 threshold on max profit
- Average and max profit calculations use highest price

#### B. PDF Report Content
- Shows both highest price and current price for each trade
- Max Profit displayed as: `$102.00 (+41.13%)`
- Outcome clearly marked as WIN or LOSS based on $100 threshold

#### C. Telegram Integration
- Now sends **TWO messages** to Telegram:
  1. **Text Summary**: Quick overview with key stats
  2. **HTML Document**: Full detailed report as downloadable file

**Example:**
```
📊 Daily Trading Report
📅 Tuesday, January 15, 2025

🎯 Performance Summary
━━━━━━━━━━━━━━━━━━━━
📌 Total Trades: 5
🔵 Active: 2
✅ Closed: 3
⏰ Expired: 0

📈 Profit Metrics
━━━━━━━━━━━━━━━━━━━━
💰 Avg Profit: +28.5%
🚀 Max Profit: +41.1%
🎯 Win Rate: 80.0%

📎 Full detailed report attached below
```

---

## Technical Details

### Profit Calculation Formula

For all closed trades:
```javascript
const entryPrice = entry_contract_snapshot.mid || entry_contract_snapshot.last
const highestPrice = contract_high_since || entryPrice
const qty = qty || 1
const multiplier = 100

// Profit in dollars
const maxProfitDollar = (highestPrice - entryPrice) × qty × multiplier

// Profit in percentage
const maxProfitPercent = ((highestPrice - entryPrice) / entryPrice) × 100
```

### Win/Loss Classification

- **WINNING TRADE**: `maxProfitDollar ≥ $100`
- **LOSING TRADE**: `maxProfitDollar < $100`

This ensures consistent classification across all systems.

---

## Deployment Instructions

The edge functions need to be deployed to Supabase. Run these commands with proper authentication:

```bash
# Deploy all updated edge functions
npx supabase functions deploy expired-trades-closer
npx supabase functions deploy telegram-outbox-processor
npx supabase functions deploy generate-daily-pdf-report
npx supabase functions deploy indices-telegram-publisher
```

---

## Verification Steps

### 1. Test Expired Trades Closer
```bash
npm run test:expired-closer
```
Expected: Telegram notification shows profit from entry to highest, not close

### 2. Test Trading Stats
- Navigate to any analyst's profile
- Check Trading Performance section
- Verify stats match manual calculation using highest prices

### 3. Test Daily Report
```bash
npm run test:pdf-report
```
Expected:
- Telegram receives text summary
- Telegram receives HTML document attachment
- All profits calculated from highest price

### 4. Test Manual Trade Close
- Close any active trade
- Check Telegram notification
- Verify profit uses highest price reached, not closing price

---

## Benefits

1. **Accurate Performance Tracking**: Analysts' stats reflect true maximum profit potential
2. **Transparent Reporting**: Users see the best price achieved, not just where it closed
3. **Fair Evaluation**: Win rate based on achieving meaningful profit threshold ($100+)
4. **Complete Documentation**: PDF reports provide full trade history with accurate data
5. **Consistent Logic**: All systems use same calculation method

---

## Notes

- The system tracks **three prices** for each trade:
  1. Entry Price (where trade started)
  2. Highest Price (maximum reached after entry)
  3. Close Price (where trade ended)

- **Profit is always calculated from Entry to Highest**, regardless of close price
- Close price is shown for reference but doesn't affect profit calculations
- This reflects the realistic trading scenario where traders would take profits at highs

---

## Database Fields Used

- `entry_contract_snapshot`: Entry price data
- `contract_high_since`: Highest price reached after entry
- `current_contract`: Current/closing price
- `max_profit`: Stored max profit in dollars
- `qty`: Number of contracts
- `is_winning_trade`: Boolean flag (based on $100 threshold)
- `trade_outcome`: Categorization (big_win, small_win, small_loss, big_loss)

---

## Status: ✅ COMPLETE

All systems now correctly calculate profit from entry to highest price. Build passes successfully.

**Date Completed**: January 15, 2026
**Build Status**: ✅ Passing
