# Telegram Bot Symbol Query Feature

## Overview

Users can now send stock ticker symbols directly to the Telegram bot to instantly search for all published analyses for that symbol. This feature includes:

- **Symbol normalization** (handles $AAPL, aapl, AAPL, etc.)
- **Rate limiting** (10 queries per 10 minutes)
- **Pagination** (10 results per page with Next/Previous buttons)
- **Direct links** to analysis pages
- **Multi-language support** (Arabic + English help messages)

## User Experience

### Sending a Symbol Query

1. User sends a ticker symbol to the bot (e.g., `AAPL`, `TSLA`, `2222.SR`)
2. Bot validates and normalizes the symbol
3. Bot queries the database for public analyses
4. Bot returns a formatted message with:
   - Total count of analyses found
   - Up to 10 analyses per page
   - Each analysis shows: title, analyzer name, date, direction, timeframe
   - "Open" button for each analysis (links to analysis page)
   - Pagination buttons if more than 10 results
   - "Search on Website" button

### Sample Bot Responses

#### Example 1: Symbol with 3 Analyses

```
📊 Analyses for AAPL
Found 3 analyses

1. 📈 AAPL Bullish Breakout Analysis
   👤 John Trader • 📅 2026-01-20 • Technical • 1D

2. 📉 AAPL Short Term Correction
   👤 Jane Analyst • 📅 2026-01-18 • Swing Trade • 4H

3. ➡️ AAPL Range Trading Setup
   👤 Mike Charts • 📅 2026-01-15 • Day Trade • 15M

[1. Open] [2. Open]
[3. Open]
[🔍 Search on Website]
```

#### Example 2: Symbol with 27 Analyses (Pagination)

```
📊 Analyses for TSLA
Found 27 analyses
Page 1 of 3

1. 📈 TSLA Bull Flag Pattern
   👤 Sarah Swing • 📅 2026-01-22 • Technical • 1D

... (showing 10 total)

[1. Open] [2. Open]
[3. Open] [4. Open]
[5. Open] [6. Open]
[7. Open] [8. Open]
[9. Open] [10. Open]
[Next ➡️]
[🔍 Search on Website]
```

#### Example 3: No Analyses Found

```
📊 Analyses for XYZ

No analyses found for this symbol.

💡 Try another symbol or check the spelling.

[🔍 Search on Website]
```

#### Example 4: Rate Limit Exceeded

```
⏱️ Rate Limit Exceeded

You've reached the maximum number of symbol queries (10 per 10 minutes).

Please wait a few minutes and try again.
```

## Technical Implementation

### Database Schema

#### New Tables

**symbols**
- Added `symbol_normalized` column (uppercase, trimmed)

**analyses**
- Added `symbol_normalized` column (denormalized for performance)

**telegram_symbol_query_limits**
- Tracks user query timestamps for rate limiting
- Auto-cleanup of entries older than 10 minutes

**telegram_pagination_state** (optional, not currently used)
- Can store pagination state for complex multi-page sessions
- Has TTL expiry of 10 minutes

#### New Indexes

```sql
CREATE INDEX idx_symbols_normalized ON symbols(symbol_normalized);
CREATE INDEX idx_analyses_symbol_normalized_created ON analyses(symbol_normalized, created_at DESC);
CREATE INDEX idx_analyses_symbol_normalized_visibility ON analyses(symbol_normalized, visibility, created_at DESC);
```

#### Database Functions

**get_analyses_by_symbol(symbol, page, page_size)**
- Returns paginated analyses for a symbol
- Includes total count in each row
- Filters by `visibility = 'public'`
- Orders by `created_at DESC`

**check_telegram_symbol_query_limit(chat_id, max_queries, window_minutes)**
- Checks if user is within rate limit
- Records the query attempt
- Returns boolean (true = allowed, false = rate limited)

### API Endpoints

#### POST /api/telegram/query-symbol

Internal API endpoint for querying analyses by symbol.

**Authentication**: Requires `x-telegram-bot-api-secret-token` header

**Request Body**:
```json
{
  "symbol": "AAPL",
  "page": 1,
  "pageSize": 10,
  "chatId": "123456789"
}
```

**Response**:
```json
{
  "rateLimited": false,
  "analyses": [
    {
      "analysis_id": "uuid",
      "analyzer_name": "John Trader",
      "analyzer_display_name": "JT",
      "title": "AAPL Bullish Setup",
      "summary": "...",
      "post_type": "analysis",
      "analysis_type": "Technical",
      "direction": "Long",
      "chart_frame": "1D",
      "created_at": "2026-01-20T10:00:00Z",
      "total_count": 27
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalCount": 27,
    "pageSize": 10
  }
}
```

### Telegram Webhook Enhancements

The webhook now handles:

1. **Regular messages** (not starting with `/`)
   - Validates if message is a ticker-like pattern
   - If valid ticker: queries analyses and sends results
   - If not valid ticker: sends help message

2. **Callback queries** (pagination buttons)
   - Parses callback data: `ANALYSES:SYMBOL:PAGE`
   - Queries the requested page
   - Edits the original message with new results

### Utility Functions

**lib/telegram/symbol-utils.ts**
- `validateAndNormalizeSymbol(input)` - Validates and normalizes symbols
- `isTickerQuery(message)` - Detects if message is a ticker query
- `formatDateForTelegram(date)` - Formats dates for display
- `escapeHtml(text)` - Escapes special chars for Telegram HTML mode

**lib/telegram/message-builder.ts**
- `buildAnalysisResultMessage()` - Formats analysis results
- `buildNoResultsMessage()` - Formats no results message
- `buildRateLimitMessage()` - Formats rate limit message
- `buildTickerHelpMessage()` - Formats help message

## Symbol Validation Rules

- Remove leading `$` if present
- Trim whitespace
- Convert to uppercase
- Maximum 20 characters
- Only alphanumeric, dots (`.`), dashes (`-`), and underscores (`_`) allowed
- Support international symbols (e.g., `2222.SR` for Saudi stocks, `BRK.B` for Berkshire)

**Valid Examples**:
- `AAPL`
- `$AAPL`
- `TSLA`
- `BRK.B`
- `2222.SR`
- `NVDA`

**Invalid Examples**:
- ` ` (empty)
- `THISISAVERYLONGSYMBOLNAME` (>20 chars)
- `AA#PL` (invalid character #)
- `AA PL` (space not allowed)

## Rate Limiting

- **Limit**: 10 symbol queries per 10 minutes per user
- **Tracking**: By Telegram chat ID
- **Storage**: `telegram_symbol_query_limits` table
- **Cleanup**: Automatic deletion of entries older than 10 minutes

## Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token (or in admin_settings table)
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Base URL (for generating links)
NEXT_PUBLIC_BASE_URL=https://analyzinghub.com
```

## Testing

### Manual Testing

1. **Test valid symbol query**:
   - Send `AAPL` to bot
   - Verify results returned with proper formatting
   - Click "Open" button, verify link works

2. **Test invalid symbol**:
   - Send `AA#PL` to bot
   - Verify error message displayed

3. **Test no results**:
   - Send `ZZZZZ` to bot
   - Verify "No analyses found" message

4. **Test pagination**:
   - Find symbol with >10 analyses
   - Send symbol to bot
   - Click "Next" button
   - Verify page 2 displayed
   - Click "Previous" button
   - Verify page 1 displayed

5. **Test rate limiting**:
   - Send 11 different symbols rapidly
   - Verify 11th query shows rate limit message

6. **Test case insensitivity**:
   - Send `aapl`, `AAPL`, `AaPl`
   - Verify all return same results

7. **Test international symbols**:
   - Send `2222.SR`
   - Verify results for Saudi stock

### Automated Testing Script

```bash
# Test symbol query
npm run test:telegram:symbol
```

Create test script in `scripts/test-telegram-symbol-query.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testSymbolQuery() {
  console.log('Testing get_analyses_by_symbol function...');

  const { data, error } = await supabase.rpc('get_analyses_by_symbol', {
    p_symbol_normalized: 'AAPL',
    p_page: 1,
    p_page_size: 10
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Results:', JSON.stringify(data, null, 2));
  console.log(`Total count: ${data?.[0]?.total_count || 0}`);
}

testSymbolQuery();
```

## Performance Considerations

- **Indexed queries**: All symbol queries use indexes for <50ms response time
- **Denormalized data**: `symbol_normalized` stored in `analyses` table to avoid JOINs
- **Pagination**: Limits result sets to 10 per page
- **Rate limiting**: Prevents abuse and excessive database load
- **Auto-cleanup**: TTL-based cleanup prevents table bloat

## Security Considerations

- **RLS enabled**: All new tables have Row Level Security
- **Service role only**: Symbol query API requires webhook secret
- **Rate limiting**: Prevents brute force symbol enumeration
- **Input validation**: Strict symbol validation prevents injection
- **HTML escaping**: All user-facing text is escaped for Telegram HTML mode

## Monitoring & Logging

All Telegram webhook operations are logged with:
- `[Telegram Webhook]` prefix
- Operation type (ticker query, callback query, etc.)
- Symbol queried
- Results count
- Errors with stack traces

Example logs:
```
[Telegram Webhook] Processing ticker query: AAPL
[Telegram Webhook] Symbol query returned 3 analyses
[Telegram Webhook] Message sent successfully
```

## Troubleshooting

### Bot not responding to symbols

1. Check webhook is configured: `/api/telegram/webhook`
2. Verify `TELEGRAM_WEBHOOK_SECRET` matches
3. Check bot token in admin settings or env var
4. Review webhook logs for errors

### Rate limit too strict

Adjust limits in migration:
```sql
-- Increase to 20 queries per 10 minutes
SELECT check_telegram_symbol_query_limit(
  'chat_id',
  20,  -- increased from 10
  10
);
```

### Pagination not working

1. Verify callback queries are handled
2. Check callback data format: `ANALYSES:SYMBOL:PAGE`
3. Review logs for callback query errors

### No results for valid symbol

1. Check symbol exists in database:
   ```sql
   SELECT * FROM symbols WHERE symbol_normalized = 'AAPL';
   ```

2. Check analyses have correct visibility:
   ```sql
   SELECT COUNT(*) FROM analyses
   WHERE symbol_normalized = 'AAPL'
   AND visibility = 'public';
   ```

3. Verify symbol_normalized was backfilled:
   ```sql
   SELECT COUNT(*) FROM analyses WHERE symbol_normalized IS NULL;
   ```

## Future Enhancements

Possible improvements:
- Add filters (date range, analyst, direction)
- Support symbol aliases (AAPL = Apple Inc)
- Add inline query support (search from any chat)
- Cache popular symbol queries
- Add analytics tracking (most searched symbols)
- Support fuzzy symbol matching
- Add subscription alerts for new analyses on followed symbols
