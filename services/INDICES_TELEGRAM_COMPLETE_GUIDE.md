# Indices Hub Telegram Integration & Trade Lifecycle - Complete Guide

## Overview

This guide documents the comprehensive Telegram integration and automated trade lifecycle system implemented for Analyzinghub's Indices Hub feature.

## What Was Implemented

### 1. Database Schema Enhancements

#### Trade Lifecycle Fields (`index_trades` table)
- `outcome` - Trade outcome: 'succeed', 'loss', 'expired'
- `pnl_usd` - Net profit/loss in USD
- `entry_cost_usd` - Initial trade cost
- `qty` - Number of contracts (default: 1)
- `expiry_datetime` - Precise expiration timestamp
- `telegram_channel_id` - Override channel for this specific trade
- `telegram_send_enabled` - Toggle to enable/disable Telegram posting

#### Analysis Telegram Fields (`index_analyses` table)
- `telegram_channel_id` - Override channel for this specific analysis
- `telegram_send_enabled` - Toggle to enable/disable Telegram posting

#### Plan Telegram Integration (`analyzer_plans` table)
- `telegram_channel_id` - UUID reference to telegram_channels table
- `telegram_broadcast_enabled` - Enable/disable broadcasts for this plan

#### Telegram Outbox (`telegram_outbox` table)
Reliable message delivery with retry logic:
- `id` - Unique message ID
- `message_type` - Type: 'new_analysis', 'new_trade', 'trade_result', etc.
- `payload` - JSONB message data
- `channel_id` - Telegram channel ID (e.g., "-1002607859974")
- `status` - 'pending', 'processing', 'sent', 'failed', 'canceled'
- `priority` - Message priority (1-10, default: 5)
- `retry_count` - Current retry attempt
- `max_retries` - Maximum retry attempts (default: 3)
- `next_retry_at` - Next retry timestamp (exponential backoff)
- `last_error` - Last error message
- `telegram_message_id` - Telegram's message ID after successful send
- `created_at`, `sent_at`, `failed_at` - Timestamps

#### Analyst Trade Statistics (`analyst_trade_stats` table)
Automated performance tracking:
- `analyst_id` - Analyst user ID
- `total_trades` - Total number of trades
- `active_trades` - Currently active trades
- `closed_trades` - Closed trades count
- `wins` - Successful trades
- `losses` - Lost trades
- `expired` - Expired trades
- `win_rate` - Win percentage
- `total_pnl_usd` - Total profit/loss
- `avg_win_usd` - Average win amount
- `avg_loss_usd` - Average loss amount
- `largest_win_usd` - Largest win
- `largest_loss_usd` - Largest loss
- `last_30_days_trades` - Recent trades count
- `last_30_days_wins` - Recent wins count
- `last_30_days_pnl_usd` - Recent P/L

### 2. Automated Trade Status Rules

#### $100 Success Threshold
- **Rule**: When net PnL reaches $100 USD, trade is marked as "succeed"
- **Calculation**: `(current_price - entry_price) * multiplier * qty >= 100`
- **Status**: Changes to "closed" with outcome "succeed"
- **Priority**: Checked BEFORE traditional targets

#### Expiration Handling
- **Rule**: When `expiry_datetime` passes, trade is marked as "expired"
- **P/L Calculation**: If current price > 0, calculate final P/L; otherwise, full loss
- **Outcome**: "succeed" if positive P/L, "expired" if zero/negative

#### Traditional Targets
- Target hit detection still works (checked after $100 rule)
- Stop loss detection (if target not hit)
- Highest price tracking after entry

#### Trade Update Frequency
- Active trades checked every 1 minute (via cron)
- Price updates from Polygon.io
- Automatic status transitions

### 3. Edge Functions

#### `indices-trade-tracker`
**Purpose**: Monitor active trades and apply lifecycle rules
**Schedule**: Every 1 minute
**Features**:
- Fetches latest prices from Polygon
- Checks $100 success threshold
- Checks traditional targets
- Checks stop loss
- Detects expiration
- Tracks highest price after entry
- Queues Telegram messages to outbox
- Updates analyst_trade_stats

#### `telegram-outbox-processor`
**Purpose**: Process pending Telegram messages with retry logic
**Schedule**: Every 2 minutes
**Features**:
- Fetches pending messages from outbox
- Formats bilingual messages (English + Arabic)
- Sends to Telegram Bot API
- Implements exponential backoff (2^n * 60 seconds)
- Max 3 retries before marking as failed
- Tracks delivery status

#### `indices-telegram-publisher` (existing, enhanced)
**Purpose**: Direct Telegram publishing (still used for immediate sends)
**Use**: When you need immediate delivery without queueing

### 4. Bilingual Message Formats

All Telegram messages are bilingual (English + Arabic):

#### New Analysis Message
```
📊 NEW INDEX ANALYSIS | تحليل جديد للمؤشر

Index | المؤشر: SPX
Title | العنوان: [Title]
Analyst | المحلل: [Name]

📈 View Full Analysis | عرض التحليل الكامل
```

#### New Trade Message
```
🎯 NEW TRADE | صفقة جديدة

Index | المؤشر: SPX
Direction | الاتجاه: CALL | شراء
Strike | السعر: $6900
Entry | الدخول: $12.50
Analyst | المحلل: [Name]

📊 View Analysis | عرض التحليل
```

#### Trade Result Message
```
🎉 TRADE WIN | فوز في الصفقة!

Index | المؤشر: SPX
Direction | الاتجاه: CALL | شراء
Entry | الدخول: $12.50
Close | الإغلاق: $15.20
Highest | الأعلى: $16.00
P/L | الربح/الخسارة: $270.00 ✅
Analyst | المحلل: [Name]

📊 View Analysis | عرض التحليل
```

#### New High Alert
```
🚀 NEW HIGH ALERT | تنبيه قمة جديدة!

Index | المؤشر: SPX
Direction | الاتجاه: CALL | شراء
Entry | الدخول: $12.50
New High | القمة الجديدة: $18.00 🎉
Gain | المكسب: +44.00%
Analyst | المحلل: [Name]

📊 View Analysis | عرض التحليل
```

### 5. Cron Jobs

Configured cron jobs (using `pg_cron` extension):

| Job Name | Schedule | Purpose |
|----------|----------|---------|
| `indices-trade-tracker` | Every 1 minute | Update trade prices and status |
| `telegram-outbox-processor` | Every 2 minutes | Send pending Telegram messages |
| `analysis-target-checker` | Every 5 minutes | Check analysis target prices |

### 6. Database Functions

#### `update_analyst_trade_stats(p_analyst_id UUID)`
- Recalculates all stats for an analyst
- Called automatically via trigger on trade status changes
- Updates analyst_trade_stats table

#### `queue_telegram_message(p_message_type, p_payload, p_channel_id, p_priority)`
- Queues a message to telegram_outbox
- Returns message ID
- Can be called from SQL or Edge Functions

### 7. Telegram Channel Configuration

#### Channel Hierarchy
1. **Analyst Channels** (`telegram_channels` table)
   - Personal channels (public, premium, VIP, etc.)
   - Managed in Settings > Telegram Channels (UI to be added)
   - Each channel has a unique UUID and Telegram channel_id

2. **Plan Channels** (`analyzer_plans.telegram_channel_id`)
   - Each subscription plan can have its own channel
   - References telegram_channels table
   - Can be configured in plan editor (UI to be added)

3. **Analysis/Trade Override**
   - Individual analyses and trades can override the channel
   - Allows specific content to go to specific channels
   - Falls back to plan channel, then analyst default channel

#### Channel Selection Priority
When sending a Telegram message:
1. Use `trade.telegram_channel_id` or `analysis.telegram_channel_id` if set
2. Else use `plan.telegram_channel_id` if analysis/trade is linked to a plan
3. Else use analyst's default channel from `telegram_channels`

## Configuration Guide

### Environment Variables

All required environment variables are already configured in Supabase:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `POLYGON_API_KEY` - Polygon.io API key

**NO MANUAL CONFIGURATION NEEDED** - These are automatically available to all Edge Functions.

### How to Get Telegram Channel ID

1. **Add bot to your channel** as an administrator
2. **Send a message** in the channel
3. **Get updates** via:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
4. **Find channel_id** in the response (looks like `-1002607859974`)
5. **Add to database**:
   ```sql
   INSERT INTO telegram_channels (user_id, channel_id, channel_name, enabled)
   VALUES ('[analyst_uuid]', '-1002607859974', 'My Premium Channel', true);
   ```

### Testing Telegram Integration

#### 1. Test Direct Sending
```bash
curl -X POST 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/indices-telegram-publisher' \
  -H 'Authorization: Bearer [service_role_key]' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "new_trade",
    "channelId": "-1002607859974",
    "data": {
      "id": "[trade_id]",
      "analysis": {"id": "[analysis_id]", "title": "Test", "index_symbol": "SPX"},
      "direction": "call",
      "entry_contract_snapshot": {"mid": 12.50},
      "strike": 6900,
      "author": {"full_name": "Test Analyst"}
    }
  }'
```

#### 2. Test Outbox System
```sql
-- Queue a test message
SELECT queue_telegram_message(
  'new_trade',
  '{"trade": {"id": "test", "direction": "call"}}'::jsonb,
  '-1002607859974',
  5
);

-- Check outbox
SELECT * FROM telegram_outbox WHERE status = 'pending';

-- Manually trigger processor
curl -X POST 'https://gbdzhdlpbwrnhykmstic.supabase.co/functions/v1/telegram-outbox-processor' \
  -H 'Authorization: Bearer [service_role_key]'
```

#### 3. Test Trade Lifecycle
```sql
-- Create a test trade
INSERT INTO index_trades (
  analysis_id, author_id, status, instrument_type, direction,
  underlying_index_symbol, polygon_underlying_index_ticker,
  polygon_option_ticker, strike, expiry, option_type,
  entry_contract_snapshot, entry_underlying_snapshot,
  current_underlying, current_contract,
  qty, contract_multiplier,
  telegram_channel_id, telegram_send_enabled
) VALUES (
  '[analysis_id]', '[author_id]', 'active', 'options', 'call',
  'SPX', 'I:SPX', 'O:SPX260110C06900000',
  6900, '2026-01-10', 'call',
  '{"mid": 12.50, "bid": 12.40, "ask": 12.60}'::jsonb,
  '{"price": 6850}'::jsonb,
  6850, 12.50,
  1, 100,
  '[telegram_channel_uuid]', true
);

-- Wait 1 minute for trade tracker to run
-- Check trade status
SELECT id, status, outcome, pnl_usd, current_contract FROM index_trades WHERE id = '[trade_id]';

-- Check outbox for messages
SELECT * FROM telegram_outbox WHERE payload->>'tradeId' = '[trade_id]';
```

## UI Components To Add (Next Steps)

### 1. Telegram Channels Management (`/dashboard/settings`)
**Path**: `/app/dashboard/settings/telegram-channels/page.tsx`

Features needed:
- List analyst's telegram_channels
- Add new channel (with test message)
- Edit channel settings
- Delete channel
- Mark as default channel

### 2. Create Analysis Form Enhancement
**File**: `/components/indices/CreateIndexAnalysisForm.tsx`

Add fields:
- Telegram Channel selector (dropdown from analyst's channels)
- "Send to Telegram" toggle (default: true)

### 3. Create Trade Form Enhancement
**File**: `/components/indices/AddTradeForm.tsx`

Add fields:
- Telegram Channel selector
- "Send to Telegram" toggle
- Quantity input (default: 1)
- Expiry date/time picker (if not auto-calculated)

### 4. Plan Editor Enhancement
**File**: `/components/settings/PlanManagement.tsx`

Add fields:
- Telegram Channel selector (from analyst's channels)
- "Enable Telegram Broadcasts" toggle

### 5. Analyst Profile Trades Section
**File**: `/app/dashboard/profile/[id]/page.tsx` (new tab)

Features:
- Trades list (All / Open / Closed / Expired filters)
- Trade cards with: symbol, entry, outcome, P/L, timestamps
- Performance stats widget:
  - Total trades, Win rate, Total P/L
  - Average win, Average loss
  - Last 30 days metrics
- Sorting: newest, biggest P/L, biggest win, biggest loss

## API Endpoints Available

### Get Analyst Trade Stats
```typescript
GET /api/analysts/[id]/trade-stats

Response:
{
  total_trades: 45,
  wins: 30,
  losses: 10,
  expired: 5,
  win_rate: 66.67,
  total_pnl_usd: 15000,
  avg_win_usd: 600,
  avg_loss_usd: -200,
  largest_win_usd: 2500,
  largest_loss_usd: -500,
  last_30_days_trades: 12,
  last_30_days_wins: 8,
  last_30_days_pnl_usd: 3200
}
```

### Get Telegram Channels
```typescript
GET /api/telegram/channels/list

Response:
{
  channels: [{
    id: "uuid",
    channel_id: "-1002607859974",
    channel_name: "My Premium Channel",
    enabled: true,
    audience_type: "premium"
  }]
}
```

### Queue Telegram Message (Server-side)
```typescript
// From Edge Function or API route
const { data } = await supabase
  .from('telegram_outbox')
  .insert({
    message_type: 'new_analysis',
    payload: analysisData,
    channel_id: '-1002607859974',
    status: 'pending',
    priority: 5,
    next_retry_at: new Date().toISOString()
  });
```

## Monitoring & Debugging

### Check Cron Job Status
```sql
SELECT * FROM cron.job ORDER BY jobname;
```

### View Recent Cron Runs
```sql
SELECT * FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'indices%' OR jobname LIKE 'telegram%')
ORDER BY start_time DESC
LIMIT 20;
```

### Monitor Telegram Outbox
```sql
-- Pending messages
SELECT count(*), status FROM telegram_outbox GROUP BY status;

-- Failed messages
SELECT * FROM telegram_outbox
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Retry queue
SELECT id, message_type, retry_count, next_retry_at, last_error
FROM telegram_outbox
WHERE status = 'pending' AND retry_count > 0
ORDER BY next_retry_at;
```

### View Analyst Stats
```sql
SELECT
  p.full_name,
  ats.*
FROM analyst_trade_stats ats
JOIN profiles p ON p.id = ats.analyst_id
ORDER BY ats.win_rate DESC, ats.total_pnl_usd DESC;
```

### Check Active Trades
```sql
SELECT
  t.id,
  t.polygon_option_ticker,
  t.status,
  t.entry_contract_snapshot->>'mid' as entry_price,
  t.current_contract,
  t.contract_high_since,
  t.pnl_usd,
  t.outcome,
  t.last_quote_at
FROM index_trades t
WHERE t.status = 'active'
ORDER BY t.last_quote_at DESC;
```

## Security Considerations

### RLS Policies
All tables have Row Level Security enabled:
- `telegram_outbox` - Service role full access, analysts can view their own
- `analyst_trade_stats` - Anyone can view, service role can update
- `telegram_channels` - Analysts can only manage their own channels
- `index_trades` - Existing RLS policies apply

### Bot Token Security
- Telegram bot token is ONLY in server-side environment variables
- Never exposed to client
- Only accessible to Edge Functions and server-side code

### Channel Permissions
- Analysts can only assign their own telegram_channels to analyses/trades/plans
- SuperAdmin can view/manage all channels (if enabled in your RBAC)

## Performance Optimizations

### Indexes
All critical queries have indexes:
- `idx_index_trades_expiry` - For expiration checks
- `idx_index_trades_telegram_channel` - For channel lookups
- `idx_telegram_outbox_status` - For pending message queries
- `idx_telegram_outbox_retry` - For retry scheduling

### Database Triggers
- `tr_index_trades_update_stats` - Auto-updates analyst stats on trade changes
- Minimal performance impact (runs asynchronously)

### Cron Job Limits
- Trade tracker processes max 50 trades per run
- Outbox processor handles max 20 messages per run
- Prevents long-running transactions

## Troubleshooting

### Telegram Messages Not Sending

1. **Check outbox status**:
   ```sql
   SELECT * FROM telegram_outbox WHERE status != 'sent' ORDER BY created_at DESC LIMIT 10;
   ```

2. **Check last error**:
   ```sql
   SELECT message_type, last_error, retry_count FROM telegram_outbox WHERE status = 'failed';
   ```

3. **Verify bot token**:
   ```bash
   curl https://api.telegram.org/bot[TOKEN]/getMe
   ```

4. **Check bot is admin** in the channel

5. **Manually trigger processor**:
   ```bash
   curl -X POST 'https://[project].supabase.co/functions/v1/telegram-outbox-processor' \
     -H 'Authorization: Bearer [service_role_key]'
   ```

### Trades Not Closing Automatically

1. **Check cron job is running**:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'indices-trade-tracker';
   ```

2. **Check recent runs**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'indices-trade-tracker')
   ORDER BY start_time DESC LIMIT 5;
   ```

3. **Manually trigger tracker**:
   ```bash
   curl -X POST 'https://[project].supabase.co/functions/v1/indices-trade-tracker' \
     -H 'Authorization: Bearer [service_role_key]'
   ```

4. **Check Polygon API key** is valid

### Stats Not Updating

Stats update automatically via trigger. If not working:

1. **Manually update**:
   ```sql
   SELECT update_analyst_trade_stats('[analyst_id]');
   ```

2. **Check trigger exists**:
   ```sql
   SELECT * FROM information_schema.triggers
   WHERE trigger_name = 'tr_index_trades_update_stats';
   ```

## Summary

This implementation provides:
- ✅ Reliable Telegram message delivery with retry logic
- ✅ Automated trade lifecycle ($100 success, expiration, targets, stops)
- ✅ Real-time analyst performance tracking
- ✅ Bilingual messaging (English + Arabic)
- ✅ Flexible channel configuration (analyst, plan, trade-specific)
- ✅ Production-grade error handling and monitoring
- ✅ Zero breaking changes to existing features
- ✅ Scalable architecture with message queuing

The backend infrastructure is complete and operational. UI components can be added incrementally as needed.
