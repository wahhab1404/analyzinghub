# Expired Trades Auto-Closer System

## Overview

The Expired Trades Auto-Closer system automatically manages option trades that have reached their expiration date. It determines trade outcomes based on a $100 profit threshold and closes trades accordingly.

## How It Works

### Contract Expiration Timing

**IMPORTANT: Contracts expire at the END of their expiry day (11:59:59 PM)**

Example:
- Contract with expiry date: January 1, 2026
- The contract is **active throughout** January 1, 2026
- The contract **expires at 11:59:59 PM** on January 1, 2026
- The system closes the trade on January 2, 2026 (or later)

The logic uses `expiryDate < currentDate` (not `<=`) to ensure:
- If today is January 1 and expiry is January 1: Contract stays active
- If today is January 2 and expiry is January 1: Contract gets closed

### Win/Loss Logic

The system uses a **$100 max profit threshold** to determine trade outcomes.

**CRITICAL**: `profit_from_entry` **ALWAYS equals `max_profit`** for all trades. This accurately reflects the P&L from entry to the highest profit point reached during the trade's lifetime.

#### Winning Trades (max_profit >= $100)
- Trade is marked as `is_winning_trade = true`
- Profit recorded: `profit_from_entry = max_profit` (positive value)
- Trade outcome categories:
  - **Big Win**: max_profit >= $500
  - **Small Win**: max_profit between $100 and $499

#### Losing Trades (max_profit < $100)
- Trade is marked as `is_winning_trade = false`
- Profit recorded: `profit_from_entry = max_profit` (usually $0 for expired worthless options)
- Trade outcome categories:
  - **Big Loss**: max_profit < -$500 (extremely rare - contract went below entry)
  - **Small Loss**: max_profit between -$500 and $0 (contract never profited or went negative)
  - **Breakeven**: max_profit between $0 and $99.99 (small profit but below $100 threshold)

#### Max Profit Tracking

`max_profit` tracks the **highest profit point** reached during the trade:
- For winning trades: Peak profit before expiry (e.g., $450)
- For losing trades: Usually $0 (contract never exceeded entry price)
- Negative values are rare (occur when contract price drops below entry before tracking ends)

### Automated Schedule

The system runs daily at **9:00 PM ET (01:00 UTC)** via a cron job:

```sql
SELECT cron.schedule(
  'expired-trades-closer',
  '0 1 * * *',  -- Daily at 01:00 UTC (9:00 PM ET)
  'Call edge function to close expired trades'
);
```

### Process Flow

1. **Query Active Trades**: Fetches all active option trades with expiry dates
2. **Identify Expired**: Filters trades where expiry date < current date
3. **Calculate Outcomes**: For each expired trade:
   - Checks `max_profit` value
   - Determines if trade reached $100 threshold
   - Sets final profit and outcome
4. **Update Database**: Closes trades with appropriate status
5. **Send Notifications**: Queues Telegram messages for trade closures

## Database Updates

When a trade is closed, the following fields are updated:

```typescript
{
  status: 'closed',
  closed_at: timestamp,
  profit_from_entry: maxProfit,     // ALWAYS equals max_profit
  current_contract: closingPrice,   // Final contract price or 0 if expired worthless
  is_winning_trade: boolean,        // true if max_profit >= $100
  trade_outcome: enum,              // big_win, small_win, breakeven, small_loss, big_loss
  notes: 'AUTO-CLOSED message'
}
```

## Telegram Notifications

Two types of notifications are sent:

### Winning Trade Message
```
🎯 Trade Auto-Closed (Expired)

SPX 5900C

✅ Max Profit Reached: $450.00
💰 Final P/L: $450.00
📊 Outcome: SMALL WIN

Expired: 2024-01-15
```

### Losing Trade Message
```
📊 Trade Auto-Closed (Expired)

SPX 5900C

❌ Did not reach $100 target
💰 P/L: +$75.00
📊 Outcome: BREAKEVEN

Expired: 2024-01-15
```

Note: For trades that never made profit, P/L shows $0.00

## Manual Testing

You can manually trigger the expired trades closer:

```bash
npm run test:expired-closer
```

This will:
- Check all active option trades
- Identify expired trades
- Show what would be closed and outcomes
- Display summary statistics

## Edge Function

The system uses a Supabase Edge Function deployed at:
```
/functions/v1/expired-trades-closer
```

Location: `supabase/functions/expired-trades-closer/index.ts`

## Dashboard Integration

The enhanced dashboard now shows:

### Win Rate Calculation
```typescript
winRate = (winningTrades / closedTrades) * 100
```

Where `winningTrades` are trades with `is_winning_trade = true` (max_profit >= $100)

### Recent Trades Display
Shows last 5 closed trades with:
- Trade outcome badges
- Final profit/loss
- Color-coded performance indicators
- Percentage returns

### Performance Metrics
- **Total P/L**: Sum of all closed trade profits
- **Win Rate %**: Percentage of trades reaching $100+
- **This Month**: Current month's profit/loss

## Important Notes

1. **Options Only**: System only processes trades with `instrument_type = 'options'`
2. **Expiry Required**: Trades must have an expiry date set
3. **Max Profit Tracking**: System relies on accurate `max_profit` tracking
4. **No Retroactive**: Only processes currently active trades
5. **Daily Execution**: Runs once per day after market close

## Monitoring

Check cron job status:
```bash
npm run verify:cron
```

View recent closed trades:
```sql
SELECT
  underlying_index_symbol,
  strike,
  option_type,
  max_profit,
  profit_from_entry,
  is_winning_trade,
  trade_outcome,
  closed_at
FROM index_trades
WHERE status = 'closed'
  AND notes LIKE '%AUTO-CLOSED%'
ORDER BY closed_at DESC
LIMIT 10;
```

## Troubleshooting

### Trades Not Closing
- Verify cron job is active: `SELECT * FROM cron.job WHERE jobname = 'expired-trades-closer';`
- Check edge function logs in Supabase dashboard
- Ensure trades have valid expiry dates

### Incorrect Win/Loss
- Verify `max_profit` is being tracked correctly
- Check `update_trade_max_profit()` trigger is active
- Review trade price updates in logs

### Missing Notifications
- Check telegram_outbox table for pending messages
- Verify telegram_channel_id is set on trades
- Ensure outbox processor cron is running
