# Daily Trade Report - Quick Start 🚀

## What Was Built

A complete end-of-day trading report system that:

✅ **Tracks Max Profit** - Every trade remembers its peak profit (highest point reached)
✅ **Identifies Winners** - Automatically marks trades with $100+ profit as "winning trades"
✅ **Sends Telegram Notifications** - Three messages per channel at market close:
  - 🎯 Winning trades (max profit > $100)
  - ⚠️ Losing trades (current loss > $20)
  - 📊 Daily summary with full statistics

✅ **Beautiful HTML Reports** - Styled tables with gradient headers and color-coded profits
✅ **Automated Scheduling** - Runs daily at 4:15 PM ET (after market close)

## How It Works

### 🎯 Winning Trade Definition
```
A trade is "winning" if max_profit > $100 at ANY point during its lifetime
```

Example:
- Entry: $2.50
- Peaked at: $4.00 → Max Profit = $150 ✅ WINNING
- Current: $3.50 → Still marked as winning forever!

### 📊 What Gets Sent to Telegram

**Message 1: Winning Trades**
```
🎯 WINNING TRADES (2024-01-11)

🎯 SPX $4800 CALL
   Entry: $25.50 → Max: $32.00
   Max Profit: +$650.00 | Current: +$520.00
```

**Message 2: Losing Trades**
```
⚠️ LOSING TRADES (2024-01-11)

❌ TSLA $250 CALL
   Entry: $5.20 → Current: $4.50
   Loss: -$70.00
```

**Message 3: Daily Summary**
```
📊 DAILY TRADING SUMMARY – 2024-01-11

📈 Total Trades: 8
✅ Winning: 5 trades
❌ Losing: 2 trades
🎯 Win Rate: 62.5%

💰 Total P&L: +$1,245.00
🏆 Biggest Win: +$650.00
⚠️ Biggest Loss: -$180.00
```

## Quick Setup (2 Minutes)

### Step 1: Test the System
```bash
npm run test:daily-report
```

### Step 2: Schedule Daily Reports

**Option A: Supabase Dashboard** (Recommended)
1. Go to your Supabase dashboard
2. Database → Cron Jobs → Create
3. Schedule: `15 20 * * 1-5` (Mon-Fri, 4:15 PM ET)
4. Command:
```sql
SELECT net.http_post(
  url := 'https://YOUR_PROJECT.supabase.co/functions/v1/indices-daily-report-sender',
  headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
);
```

**Option B: Manual Trigger**
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/indices-daily-report-sender' \
  -H "Authorization: Bearer YOUR_SERVICE_KEY"
```

## Database Changes

New columns in `index_trades`:
- `max_profit` - Highest profit reached ($)
- `max_contract_price` - Peak contract price
- `profit_from_entry` - Current profit/loss
- `is_winning_trade` - Boolean (true if max profit > $100)
- `trade_outcome` - Enum: big_win, small_win, breakeven, small_loss, big_loss
- `daily_notified_at` - Timestamp of notification

## Testing Individual Components

### Test Max Profit Calculation
```sql
SELECT
  underlying_index_symbol,
  profit_from_entry,
  max_profit,
  is_winning_trade,
  trade_outcome
FROM index_trades
WHERE status = 'live'
ORDER BY max_profit DESC;
```

### Test Daily Summary Function
```sql
SELECT * FROM get_daily_trade_summary('2024-01-11', NULL);
```

### Trigger Edge Function Manually
```bash
npm run test:daily-report
```

## Monitoring

### Check Recent Reports
```sql
SELECT
  report_date,
  trade_count,
  summary->>'winning' as wins,
  summary->>'win_rate' as win_rate,
  summary->>'total_profit' as pnl
FROM daily_trade_reports
ORDER BY report_date DESC
LIMIT 5;
```

### View Today's Winners
```sql
SELECT
  underlying_index_symbol as symbol,
  strike,
  max_profit,
  profit_from_entry as current_profit
FROM index_trades
WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE
  AND is_winning_trade = true
ORDER BY max_profit DESC;
```

## Files Created

- `supabase/functions/indices-daily-report-sender/index.ts` - Main edge function
- `services/indices/daily-report-generator.ts` - HTML generator
- `scripts/test-daily-report.ts` - Test script
- `DAILY_TRADE_REPORT_SETUP.md` - Full documentation
- Migration: `add_max_profit_and_trade_status_tracking.sql`
- Table: `daily_trade_reports`

## Troubleshooting

**No notifications?**
- Check TELEGRAM_BOT_TOKEN in edge function environment
- Verify channels have valid `channel_id`

**Wrong calculations?**
- Trigger updates automatically on price changes
- Manual override: run `npm run test:daily-report`

**Missing trades?**
- Trades must have `status = 'live'`
- Check `telegram_channel_id` is set

## What's Next?

Once you have live trades:
1. The system automatically tracks max profit on every price update
2. At 4:15 PM ET daily, notifications are sent
3. Beautiful HTML reports are generated and stored
4. You can view historical reports in the database

That's it! The system is fully automated. 🎉
