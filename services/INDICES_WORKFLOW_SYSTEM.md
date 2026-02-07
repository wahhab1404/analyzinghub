# Indices Analysis + Trades Workflow System

Complete implementation of the Indices Hub system with automated tracking, WIN/LOSS classification, and Telegram publishing.

## Overview

The Indices Hub enables analysts to:
1. Publish index analyses (SPX, NDX, DJI) with technical details
2. Add options/futures trades under analyses
3. Track trades in real-time with automated price updates
4. Automatically classify trades as WIN/LOSS when conditions met
5. Publish everything to Telegram channels (bilingual: Arabic + English)
6. Post live updates for analyses and trades

## System Components

### 1. Database Schema

#### New Tables
- **telegram_send_log**: Audit log for all Telegram messages with deduplication

#### Extended Tables

**index_analyses**
- `timeframe`: Trading timeframe (1m, 5m, 15m, 1h, 4h, 1d, etc.)
- `schools_used`: Array of analysis methodologies
- `invalidation_price`: Price level that invalidates the analysis
- `telegram_channel_id`: Reference to Telegram channel
- `telegram_message_id`: Telegram message ID after publishing
- `telegram_published_at`: When published to Telegram

**index_trades**
- `trade_price_basis`: Whether targets/stops reference OPTION_PREMIUM or UNDERLYING_PRICE
- `entry_price_source`: 'polygon' (auto) or 'manual' (override)
- `entry_override_reason`: Explanation if manual entry used
- `win_condition_met`: Description when trade wins
- `loss_condition_met`: Description when trade loses
- `telegram_message_id`: Telegram message ID
- `telegram_published_at`: When published to Telegram

**analysis_updates** & **trade_updates**
- `text_en`: English text
- `text_ar`: Arabic text
- `update_type`: manual | system | target_hit | stop_hit | etc.
- `telegram_message_id`: Telegram message ID if sent
- `telegram_published_at`: When published to Telegram

### 2. Supabase Edge Functions

#### indices-telegram-publisher
**Purpose**: Publish analyses, trades, updates, and results to Telegram channels

**Endpoint**: `POST /functions/v1/indices-telegram-publisher`

**Request Body**:
```json
{
  "entityType": "analysis" | "trade" | "analysis_update" | "trade_update" | "trade_result",
  "entityId": "uuid",
  "channelId": "uuid",
  "forceResend": false
}
```

**Features**:
- Bilingual messages (Arabic + English)
- Deduplication (won't send duplicate messages)
- Formatted message templates for each entity type
- Logs all sends to `telegram_send_log`
- Updates entities with `telegram_message_id` and `telegram_published_at`

**Message Templates**:
- **Analysis**: Index symbol, timeframe, analyst, methods, title, description, invalidation price, link
- **Trade**: Index, direction, contract details, entry, target 1, stop, analyst, link
- **Update**: Entity info, text (bilingual), link
- **Result**: WIN/LOSS indicator, entry/close prices, highest price after entry, P/L%, analyst, link

#### indices-trade-tracker
**Purpose**: Scheduled job to update prices and auto-classify WIN/LOSS

**Endpoint**: `POST /functions/v1/indices-trade-tracker`

**Schedule**: Runs every 2-5 minutes (configure via Supabase cron)

**Process**:
1. Fetches all active trades (status = 'active')
2. For each trade:
   - Fetches latest quotes from Polygon API
   - Updates `current_underlying` and `current_contract`
   - Updates `underlying_high_since` and `contract_high_since` (HPAE)
   - Checks WIN condition (target 1 hit)
   - Checks LOSS condition (stop hit)
   - If WIN/LOSS detected:
     - Updates status to 'tp_hit' or 'sl_hit'
     - Sets `closed_at`
     - Sets `win_condition_met` or `loss_condition_met`
     - Creates system update
     - Triggers Telegram result notification
3. Rate limits: 200ms between Polygon requests (5 req/sec)
4. Processes up to 50 trades per run

**WIN/LOSS Logic**:
```typescript
// For CALL options:
- WIN if current_price >= target1_price
- LOSS if current_price <= stop_price

// For PUT options:
- WIN if current_price <= target1_price (if targeting premium drop)
- LOSS if current_price >= stop_price

// Uses trade_price_basis to determine which price to compare:
- OPTION_PREMIUM: Compare contract price
- UNDERLYING_PRICE: Compare underlying index price
```

### 3. API Routes

#### POST /api/indices/analyses
Create new index analysis

**New Request Fields**:
```typescript
{
  index_symbol: "SPX" | "NDX" | "DJI",
  title: string,
  body: string,
  chart_image_url?: string,
  timeframe?: string,                    // NEW
  schools_used?: string[],               // NEW
  invalidation_price?: number,           // NEW
  telegram_channel_id?: string,          // NEW
  auto_publish_telegram?: boolean,       // NEW
  visibility: "public" | "subscribers",
  status: "draft" | "published"
}
```

**Behavior**:
- If `auto_publish_telegram` is true and status is 'published', automatically publishes to Telegram

#### POST /api/indices/analyses/[id]/trades
Create new trade under analysis

**New Request Fields**:
```typescript
{
  analysis_id: string,
  instrument_type: "options" | "futures",
  direction: "call" | "put",
  underlying_index_symbol: string,
  trade_price_basis?: "OPTION_PREMIUM" | "UNDERLYING_PRICE",  // NEW - defaults to OPTION_PREMIUM
  polygon_option_ticker?: string,
  strike?: number,
  expiry?: string,
  option_type?: "call" | "put",
  targets?: Array<{level: number, description: string}>,
  stoploss?: {level: number, description: string},
  notes?: string,
  entry_override?: number,               // NEW - manual entry price
  entry_override_reason?: string,        // NEW - why override
  auto_publish_telegram?: boolean        // NEW
}
```

**Behavior**:
- Fetches real-time snapshots from Polygon for underlying + contract
- If `entry_override` provided, uses manual entry instead of Polygon price
- Sets trade status to 'active' immediately
- Initializes HPAE tracking (contract_high_since, underlying_high_since)
- If `auto_publish_telegram` is true, publishes trade to channel

#### POST /api/indices/analyses/[id]/updates
Post update to analysis

**New Request Fields**:
```typescript
{
  text_en: string,                       // NEW (replaces body)
  text_ar?: string,                      // NEW
  update_type?: "manual" | "system" | "target_hit" | "stop_hit",  // NEW
  attachment_url?: string,
  auto_publish_telegram?: boolean        // NEW
}
```

**Behavior**:
- Creates bilingual update
- If `auto_publish_telegram` is true, publishes to channel

#### POST /api/indices/trades/[id]/updates
Post update to trade

**Same pattern as analysis updates above**

### 4. Frontend Integration

#### Realtime Subscriptions

Subscribe to changes for live updates:

```typescript
// Subscribe to trade updates
const supabase = createClient();

supabase
  .channel('index-trades-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'index_trades',
      filter: `analysis_id=eq.${analysisId}`
    },
    (payload) => {
      console.log('Trade updated:', payload.new);
      // Update UI with new prices, status, etc.
    }
  )
  .subscribe();

// Subscribe to updates
supabase
  .channel('analysis-updates')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'analysis_updates',
      filter: `analysis_id=eq.${analysisId}`
    },
    (payload) => {
      console.log('New update:', payload.new);
      // Add update to UI feed
    }
  )
  .subscribe();
```

#### Example: Creating Analysis with Telegram

```typescript
const response = await fetch('/api/indices/analyses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    index_symbol: 'SPX',
    title: 'SPX Bullish Setup - 1H',
    body: 'Clear bullish divergence on RSI...',
    chart_image_url: 'https://...',
    timeframe: '1h',
    schools_used: ['Classic TA', 'ICT'],
    invalidation_price: 5800,
    telegram_channel_id: 'channel-uuid',
    auto_publish_telegram: true,
    visibility: 'subscribers',
    status: 'published'
  })
});

const { analysis } = await response.json();
```

#### Example: Creating Trade

```typescript
const response = await fetch(`/api/indices/analyses/${analysisId}/trades`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    analysis_id: analysisId,
    instrument_type: 'options',
    direction: 'call',
    underlying_index_symbol: 'SPX',
    trade_price_basis: 'OPTION_PREMIUM',
    polygon_option_ticker: 'O:SPX251231C05900000',
    strike: 5900,
    expiry: '2025-12-31',
    option_type: 'call',
    targets: [
      { level: 15.50, description: 'Target 1' },
      { level: 20.00, description: 'Target 2' }
    ],
    stoploss: { level: 8.00, description: 'Stop loss' },
    notes: 'Risk 2% per contract',
    auto_publish_telegram: true
  })
});

const { trade } = await response.json();
// Trade is now active and being tracked
```

#### Example: Posting Update

```typescript
const response = await fetch(`/api/indices/analyses/${analysisId}/updates`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text_en: 'Trade moving well. Consider moving stop to breakeven at +5 points.',
    text_ar: 'الصفقة تسير بشكل جيد. فكر في نقل وقف الخسارة إلى نقطة التعادل عند +5 نقاط.',
    update_type: 'adjustment',
    auto_publish_telegram: true
  })
});
```

## Environment Variables

### Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Polygon API (for market data)
POLYGON_API_KEY=your-polygon-api-key

# App Base URL (for Telegram links)
APP_BASE_URL=https://your-domain.com

# Telegram Bot Token (stored in admin_settings or env)
TELEGRAM_BOT_TOKEN=bot-token
```

### Edge Functions Environment

Edge functions automatically inherit these environment variables from Supabase. No manual configuration needed.

## Deployment

### 1. Deploy Database Schema

```bash
# Schema is already applied via migration:
# supabase/migrations/20260104_xxxxxx_extend_indices_workflow_system.sql
```

### 2. Deploy Edge Functions

Edge functions are already deployed:
- `indices-telegram-publisher`
- `indices-trade-tracker`

### 3. Configure Cron Job

In Supabase Dashboard → Database → Cron Jobs:

```sql
-- Run trade tracker every 3 minutes during market hours
SELECT cron.schedule(
  'indices-trade-tracker',
  '*/3 * * * *',  -- Every 3 minutes
  $$
  SELECT
    net.http_post(
      url:='https://your-project.supabase.co/functions/v1/indices-trade-tracker',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**Recommendation**: Run during market hours only (9:30 AM - 4:00 PM ET) to save API calls:
```sql
-- Market hours only (9:30 AM - 4:00 PM ET, Mon-Fri)
SELECT cron.schedule(
  'indices-trade-tracker-market-hours',
  '*/3 9-16 * * 1-5',  -- Every 3 min, 9 AM - 4 PM, Mon-Fri
  $$...$$
);
```

### 4. Build and Deploy App

```bash
npm run build
# Deploy to Netlify or your hosting provider
```

## Performance Optimizations

### 1. Database Indexes

Already created:
- `idx_index_trades_needs_update` on (status, last_quote_at) WHERE status = 'active'
- `idx_telegram_send_log_hash` on (payload_hash) for deduplication
- `idx_telegram_send_log_status` on (status, created_at) WHERE status = 'pending'

### 2. Rate Limiting

- Trade tracker: 200ms between Polygon requests (5 req/sec)
- Processes max 50 trades per run
- Batch processing to avoid timeouts

### 3. Caching

- Price updates cached in database (last_quote_at timestamp)
- Telegram deduplication via payload hash
- No client-side polling - uses Supabase Realtime

### 4. Cost Optimization

- Run tracker only during market hours
- Implement exponential backoff for Polygon errors
- Use Polygon aggregates endpoint for historical data

## Security

### 1. RLS Policies

All tables have Row Level Security enabled:
- Analysts can CRUD their own analyses/trades
- Subscribers can read based on visibility settings
- Service role can update prices (tracker)
- Public can read public analyses only

### 2. API Keys

- Polygon API key: Server-side only (Edge Functions)
- Telegram bot token: Server-side only (admin_settings table or env)
- Never exposed to browser

### 3. Telegram Deduplication

- Prevents duplicate sends
- Stores hash of message content
- Checks before sending

## Monitoring

### Key Metrics to Track

1. **Trade Tracker Performance**:
   - Execution time
   - Trades processed per run
   - Polygon API errors
   - WIN/LOSS detection rate

2. **Telegram Delivery**:
   - Success rate
   - Failed sends
   - Retry attempts

3. **Database Performance**:
   - Active trades count
   - Query execution times
   - Realtime connection count

### Logging

All Edge Functions log to Supabase Logs:
- View in Supabase Dashboard → Edge Functions → Logs
- Search by function name
- Filter by error level

### Example Queries

```sql
-- Check recent trade closures
SELECT
  id,
  status,
  win_condition_met,
  loss_condition_met,
  closed_at
FROM index_trades
WHERE status IN ('tp_hit', 'sl_hit')
AND closed_at > now() - interval '24 hours'
ORDER BY closed_at DESC;

-- Check Telegram send success rate
SELECT
  status,
  COUNT(*) as count
FROM telegram_send_log
WHERE created_at > now() - interval '24 hours'
GROUP BY status;

-- Find trades with highest HPAE (best performance)
SELECT
  t.*,
  ((t.contract_high_since - (t.entry_contract_snapshot->>'mid')::numeric) /
   (t.entry_contract_snapshot->>'mid')::numeric * 100) as hpae_percent
FROM index_trades t
WHERE t.status = 'active'
ORDER BY hpae_percent DESC
LIMIT 10;
```

## Troubleshooting

### Trades Not Updating

1. Check if cron job is running:
```sql
SELECT * FROM cron.job WHERE jobname = 'indices-trade-tracker';
```

2. Check Edge Function logs in Supabase Dashboard

3. Verify Polygon API key is configured

4. Check active trades count:
```sql
SELECT COUNT(*) FROM index_trades WHERE status = 'active';
```

### Telegram Not Sending

1. Check bot token configuration:
```sql
SELECT * FROM admin_settings WHERE setting_key = 'telegram_bot_token';
```

2. Check channel settings:
```sql
SELECT * FROM telegram_channels WHERE enabled = true;
```

3. Check send logs:
```sql
SELECT * FROM telegram_send_log
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

### WIN/LOSS Not Detecting

1. Verify `trade_price_basis` is set correctly
2. Check if targets/stoploss are defined:
```sql
SELECT id, targets, stoploss FROM index_trades WHERE status = 'active';
```

3. Check current prices are updating:
```sql
SELECT id, current_contract, last_quote_at
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC;
```

## Future Enhancements

1. **Advanced Position Sizing**: Calculate position size based on risk per trade
2. **Multiple Targets**: Track partial exits at Target 2, 3, etc.
3. **Trailing Stops**: Automatically adjust stops as trade moves in favor
4. **Performance Analytics**: Detailed win rate, average R, Sharpe ratio per analyst
5. **Image Generation**: Auto-generate result cards with charts for Telegram
6. **Multi-Language Support**: Add more languages beyond English/Arabic
7. **Voice Updates**: Telegram voice message support for quick updates
8. **Trade Journal**: PDF export of all trades with performance metrics
9. **Discord Integration**: Publish to Discord in addition to Telegram
10. **AI Analysis**: Use AI to analyze chart images and suggest entries

## Support

For issues or questions:
1. Check Supabase logs
2. Review this documentation
3. Check database schema in migrations folder
4. Test Edge Functions via Supabase Dashboard

## License

This system is part of the AnalyzHub platform.
