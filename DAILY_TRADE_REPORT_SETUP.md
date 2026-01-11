# Daily Trade Report System - Setup Guide

## Overview

The daily trade report system automatically generates end-of-day summaries for options trades, sends notifications to Telegram channels, and tracks winning/losing trades based on a $100+ profit threshold.

## Features Implemented

### 1. **Max Profit Tracking** ✅
- Every trade now tracks `max_profit` (highest profit reached in USD)
- `max_contract_price` stores the peak contract price
- `profit_from_entry` shows current profit/loss
- `is_winning_trade` automatically set to `true` when max profit exceeds $100
- `trade_outcome` categorizes trades: big_win, small_win, breakeven, small_loss, big_loss

### 2. **Daily Summary Function** ✅
Database function: `get_daily_trade_summary(target_date, author_id)`
- Returns all trades for a specific date
- Automatically calculates max profit from entry to highest point
- Groups trades by channel and author

### 3. **Telegram Notifications** ✅
Sends three separate messages per channel:
1. **Winning Trades** 🎯 - All trades with max profit > $100 or current profit > $20
2. **Losing Trades** ⚠️ - All trades with current loss < -$20
3. **Daily Summary** 📊 - Complete statistics including:
   - Total trades
   - Win rate
   - Total P&L
   - Biggest win/loss

### 4. **Beautiful HTML Reports** ✅
- Gradient header with purple theme
- Summary cards showing key metrics
- Styled table with color-coded profits
- Responsive design
- Stored in `daily_trade_reports` table

## Setup Instructions

### Step 1: Configure Cron Job

You need to schedule the daily report to run at **4:15 PM ET** (after market close).

#### Option A: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Cron Jobs**
3. Click **Create a new cron job**
4. Configure:
   - **Name**: `indices-daily-report-sender`
   - **Schedule**: `15 20 * * 1-5` (4:15 PM ET, Monday-Friday)
   - **Command**:
   ```sql
   SELECT
     net.http_post(
       url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/indices-daily-report-sender',
       headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
       body := '{"scheduled": true}'::jsonb
     ) AS request_id;
   ```
5. Replace `YOUR_PROJECT_REF` and `YOUR_SERVICE_ROLE_KEY` with your actual values

#### Option B: Manual Trigger via API

You can also trigger the report manually or via your own scheduler:

```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/indices-daily-report-sender' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -d '{"date": "2024-01-11"}'
```

### Step 2: Test the System

Run this test script to verify everything works:

```bash
npm run test:daily-report
```

Or manually trigger for a specific date:

```typescript
// Test for yesterday's trades
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/indices-daily-report-sender?date=2024-01-10`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  }
)

const result = await response.json()
console.log(result)
```

## How It Works

### Winning Trade Definition
A trade is considered "winning" if:
- `max_profit` > $100 at any point, OR
- `profit_from_entry` > $20 (current profit)

### Profit Calculation
```typescript
profit_from_entry = (current_contract_price - entry_contract_price) × qty × multiplier

// Example:
// Entry: $2.50, Current: $4.00, Qty: 1, Multiplier: 100
// Profit = ($4.00 - $2.50) × 1 × 100 = $150 ✅ WINNING TRADE
```

### Max Profit Tracking
- Updates automatically on every price update via database trigger
- Tracks the highest profit ever reached during the trade lifetime
- Never decreases (keeps historical peak)

### Daily Report Flow

1. **4:15 PM ET**: Cron job triggers edge function
2. **Fetch trades**: Get all trades from that day using `get_daily_trade_summary()`
3. **Group by channel**: Organize trades per Telegram channel
4. **Calculate summary**: Total trades, win rate, P&L, etc.
5. **Send notifications**:
   - Winning trades notification (if any)
   - Losing trades notification (if any)
   - Daily summary with full statistics
6. **Generate HTML**: Create styled report and store in database
7. **Mark as notified**: Update `daily_notified_at` timestamp

## Database Tables

### `index_trades` (Updated)
New columns:
- `max_profit` - Highest profit reached (in dollars)
- `max_contract_price` - Peak contract price
- `profit_from_entry` - Current profit/loss
- `is_winning_trade` - Boolean flag for $100+ profit
- `trade_outcome` - Enum: big_win, small_win, breakeven, small_loss, big_loss
- `daily_notified_at` - Timestamp of daily notification

### `daily_trade_reports` (New)
Stores generated reports:
- `report_date` - Date of the report
- `telegram_channel_id` - Channel that received the report
- `html_content` - Full HTML report
- `summary` - JSON summary statistics
- `trade_count` - Number of trades in report

## Edge Functions

### `indices-daily-report-sender`
Main function that:
- Fetches daily trades
- Groups by channel
- Sends Telegram notifications
- Generates and stores HTML reports

**Endpoint**: `/functions/v1/indices-daily-report-sender`

**Parameters**:
- `date` (optional) - Target date in YYYY-MM-DD format (defaults to yesterday)
- `author_id` (optional) - Filter trades by specific author

## Notification Examples

### Winning Trades Message
```
🎯 **WINNING TRADES** (2024-01-11)

🎯 **SPX** $4800 CALL
   Entry: $25.50 → Max: $32.00
   Max Profit: **+$650.00** | Current: +$520.00

✅ **TSLA** $250 CALL
   Entry: $5.20 → Max: $6.80
   Max Profit: **+$160.00** | Current: +$140.00
```

### Daily Summary Message
```
📊 **DAILY TRADING SUMMARY** – 2024-01-11
📢 Premium Options Channel

📈 Total Trades: **8**
✅ Winning: **5** trades
❌ Losing: **2** trades
🎯 Win Rate: **62.5%**

💰 Total P&L: **+$1,245.00**
🏆 Biggest Win: **+$650.00**
⚠️ Biggest Loss: **-$180.00**
```

## Monitoring

### Check Last Report Status
```sql
SELECT
  report_date,
  trade_count,
  summary->>'winning' as winning_trades,
  summary->>'total_profit' as total_pnl,
  created_at
FROM daily_trade_reports
ORDER BY report_date DESC
LIMIT 5;
```

### View Trades Pending Notification
```sql
SELECT COUNT(*) as pending_count
FROM index_trades
WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE - 1
  AND daily_notified_at IS NULL
  AND status = 'live';
```

### Check Winning Trades Today
```sql
SELECT
  underlying_symbol,
  strike,
  option_type,
  profit_from_entry,
  max_profit,
  is_winning_trade
FROM index_trades
WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE
  AND is_winning_trade = true
ORDER BY max_profit DESC;
```

## Troubleshooting

### No notifications sent?
1. Check `TELEGRAM_BOT_TOKEN` is configured in edge function environment
2. Verify channels have valid `channel_id` (Telegram chat ID)
3. Check edge function logs in Supabase dashboard

### Wrong profit calculations?
1. Verify `entry_contract_snapshot` has valid price data
2. Check `manual_contract_price` isn't overriding incorrectly
3. Ensure `contract_multiplier` is set (usually 100)

### Missing trades in report?
1. Confirm trades have `status = 'live'`
2. Check `created_at` timezone (should be ET)
3. Verify `telegram_channel_id` is set on trades

## Future Enhancements

Potential additions:
- [ ] Image generation from HTML (screenshot service)
- [ ] Weekly summary reports
- [ ] Monthly performance analytics
- [ ] Per-strategy breakdowns
- [ ] Comparison charts (week over week)
- [ ] Email notifications for analysts

## Support

For issues or questions, check:
1. Supabase edge function logs
2. Database trigger execution
3. Telegram bot API responses
4. Cron job execution history
