# Telegram Bot & Reports System - Complete Guide

**Comprehensive Documentation for AnalyzingHub's Telegram Integration and Reporting Features**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Telegram Bot Setup](#telegram-bot-setup)
3. [Telegram Channel Integration](#telegram-channel-integration)
4. [Broadcasting System](#broadcasting-system)
5. [Symbol Query Feature](#symbol-query-feature)
6. [Subscription System](#subscription-system)
7. [Reports System](#reports-system)
8. [Daily Reports](#daily-reports)
9. [Indices Hub Integration](#indices-hub-integration)
10. [Resend Features](#resend-features)
11. [Troubleshooting](#troubleshooting)
12. [API Reference](#api-reference)

---

## Introduction

This comprehensive guide consolidates all documentation related to Telegram bot integration and reporting systems for AnalyzingHub. The system enables analyzers to send real-time notifications, broadcast analyses, manage subscriptions, and generate professional trading reports—all through Telegram.

### Key Features

- **Personal Notifications**: Direct messages to traders for targets, stop losses, and new analyses
- **Channel Broadcasting**: Automatic posting to public, followers, and subscriber channels
- **Symbol Query**: Search analyses by ticker symbol directly in Telegram
- **Subscription Management**: Automated channel access for subscribers
- **Daily Reports**: Professional HTML/PDF reports with Arabic/RTL support
- **Multi-Language**: Full English and Arabic support throughout

---

## Telegram Bot Setup

### Prerequisites

- A Telegram account
- AnalyzingHub account with analyzer role
- Admin access to create a Telegram bot

### Step 1: Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Start a conversation and send `/newbot`
3. Follow the prompts to:
   - Choose a name for your bot (e.g., "AnalyzingHub Alerts")
   - Choose a username for your bot (must end in 'bot', e.g., "AnalyzingHubBot")
4. BotFather will provide you with a **Bot Token**. Save this token securely.

Example response from BotFather:
```
Done! Congratulations on your new bot. You will find it at t.me/AnalyzingHubBot
You can now add a description, about section and profile picture for your bot.

Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### Step 2: Configure Environment Variables

Add the following environment variables to your `.env` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_SECRET=your_random_secret_here

# Application Base URL (for links in messages)
APP_BASE_URL=https://yourdomain.com
```

### Generating a Webhook Secret

Generate a secure random string for the webhook secret:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Set Up Telegram Webhook (Production)

To receive messages from users, you need to set up a webhook:

1. Replace the placeholders in the URL below:
   - `YOUR_BOT_TOKEN`: Your bot token from Step 1
   - `YOUR_DOMAIN`: Your production domain
   - `YOUR_WEBHOOK_SECRET`: The secret from Step 2

2. Open this URL in your browser or use curl:

```bash
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://YOUR_DOMAIN/api/telegram/webhook&secret_token=YOUR_WEBHOOK_SECRET
```

Example:
```bash
https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz/setWebhook?url=https://analyzinghub.com/api/telegram/webhook&secret_token=abc123def456
```

3. You should receive a response like:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Step 4: Verify Webhook Status

Check your webhook configuration:

```bash
https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

### Step 5: Set Up Bot Menu

The bot includes a comprehensive menu system that appears when users type `/`:

```bash
npm run telegram:menu
```

This configures the bot commands:
- `/start` - Link your account and get started
- `/help` - Show help menu with all features
- `/menu` - Display the bot menu
- `/status` - Check if your account is linked

### Bot Commands

Users can interact with the bot using these commands:

- `/start <code>` - Link Telegram account using the code
- `/status` - Check if account is linked
- `/help` - Show available commands
- **Ticker symbols** - Just send any stock symbol (e.g., AAPL, TSLA) to search analyses

### User Flow - Linking Telegram Accounts

#### For Users (Traders):

1. Log in to AnalyzingHub
2. Go to **Settings → Telegram**
3. Click **Generate Link Code**
4. Copy the 8-character code (e.g., `ABC123XY`)
5. Open Telegram and search for your bot (e.g., `@AnalyzingHubBot`)
6. Start the bot and send:
   ```
   /start ABC123XY
   ```
7. The bot will confirm the linking with a success message
8. Return to AnalyzingHub settings to configure notification preferences

### Message Format

Telegram notifications are sent in both **English** and **Arabic**:

#### Target Hit Example:
```
🎯 Target Hit!

Analyzer: John Doe
Symbol: BTC/USD
Target 2: $45,000.00

Target successfully reached!

View Analysis: [Link]

══════════

🎯 تم الوصول للهدف!

المحلل: John Doe
الرمز: BTC/USD
الهدف 2: $45,000.00

تم الوصول للهدف بنجاح!
```

#### Stop Loss Example:
```
🛑 Stop Loss Hit

Analyzer: John Doe
Symbol: ETH/USD
Stop Price: $2,400.00

Stop loss has been triggered.

View Analysis: [Link]

══════════

🛑 تم الوصول لوقف الخسارة

المحلل: John Doe
الرمز: ETH/USD
سعر الوقف: $2,400.00

تم تفعيل وقف الخسارة.
```

### Rate Limiting & Throttling

The system includes built-in protection:

- **Rate Limit**: Maximum 10 messages per user per minute
- **Quiet Hours**: Notifications respect user-configured quiet hours
- **Deduplication**: Same event won't be sent twice

---

## Telegram Channel Integration

Analyzers can connect their Telegram channels to automatically broadcast analysis updates to their subscribers.

### Channel Setup

1. Create a Telegram channel or use an existing one
2. Add `@AnalyzingHubBot` to your channel as an admin
3. Give the bot permission to post messages
4. Go to **Settings → Channel** in AnalyzingHub
5. Enter your channel username (e.g., @mychannel) or channel ID
6. Click **Connect** to verify and activate broadcasting

### Channel ID vs Username

You can connect using either:
- **Channel Username**: Public channels with usernames (e.g., `@mychannel`)
- **Channel ID**: Any channel's numeric ID (e.g., `-1001234567890`)

To find your channel ID:
1. Forward a message from your channel to `@userinfobot`
2. The bot will show you the channel ID

### Channel Types

You can connect up to 3 channels, one for each audience type:

1. **Public Channel** (`audience_type: 'public'`)
   - Broadcasts all public posts to all followers
   - Open to everyone

2. **Followers Channel** (`audience_type: 'followers'`)
   - Broadcasts follower-only posts
   - For users who follow you

3. **Subscribers Channel** (`audience_type: 'subscribers'`)
   - Broadcasts subscriber-only posts
   - Premium content for paid subscribers
   - Can link to specific subscription plans

### Authentication & Access Control

**Important Changes for Channel API Routes:**

All Telegram channel API routes now use proper route handler authentication:

```typescript
// Correct authentication pattern
import { createRouteHandlerClient } from '@/lib/api-helpers';
const supabase = createRouteHandlerClient(request);
```

This ensures:
- Proper cookie handling in Next.js route handlers
- Maintains session state across requests
- Works correctly with Supabase's SSR authentication

### Broadcasting Features

Analyzers can choose which events to broadcast:

1. **New Analysis** - Automatically post when publishing a new analysis
   - Includes symbol, direction, and entry price
   - Links to the full analysis on AnalyzingHub

2. **Target Hit** - Broadcast when a target is reached
   - Shows which target was hit and the price
   - Helps followers track progress

3. **Stop Loss Hit** - Alert when a stop loss is triggered
   - Notifies subscribers of stopped analyses
   - Transparent communication

### Broadcast Message Format

All broadcasts are sent in both English and Arabic:

**New Analysis Example:**
```
📊 New Analysis Published

Analyzer: John Doe
Symbol: BTC/USD
Direction: Long
Entry: $45,000.00

View Full Analysis: [Link]

══════════

📊 تحليل جديد

المحلل: John Doe
الرمز: BTC/USD
الاتجاه: Long
الدخول: $45,000.00
```

### Managing Your Channel

From Settings → Channel, you can:
- View connection status
- Enable/disable specific broadcast types
- Disconnect your channel
- See when the channel was connected

### Channel Configuration Details

#### Plan-Specific Channels
- Linked to a specific analyzer plan via `linked_plan_id`
- Only subscribers of that specific plan receive messages
- Multiple plan-specific channels can exist per analyst

#### Platform Default Channels
- Marked with `is_platform_default: true`
- Matches analysis visibility (`public`, `followers`, `subscribers`)
- Fallback channel when no plan-specific channels exist

---

## Broadcasting System

### How Broadcasting Works

When an analysis is published:

1. **Collect Channels to Broadcast To:**
   - If analysis has specific plans selected → Get plan-specific channels
   - Always get the platform default channel matching the visibility
   - Avoid duplicates

2. **Send to Each Channel:**
   ```typescript
   for (const channel of broadcastChannels) {
     const broadcastResponse = await fetch(
       `${req.nextUrl.origin}/api/telegram/channel/broadcast-new-analysis`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           analysisId: analysis.id,
           userId: user.id,
           channelId: channel.telegram_channel_id || channel.id,
         }),
       }
     );
   }
   ```

3. **Broadcast Endpoint Calls Edge Function:**
   - `/api/telegram/channel/broadcast-new-analysis` validates the request
   - Calls Supabase Edge Function `telegram-channel-broadcast`
   - Edge function formats and sends the Telegram message

### Channel Verification

**Critical Fix:** Broadcasts now properly check channel verification status:

```typescript
// Correct verification check
.not('verified_at', 'is', null)  // verified_at IS NOT NULL

// WRONG (this was the bug)
.eq('verified', true)  // This column doesn't exist!
```

The `telegram_channels` table has `verified_at` timestamp column:
- NULL = not verified
- timestamp = verified at that time

### Channel Selection Priority

When sending a Telegram message:
1. Use `trade.telegram_channel_id` or `analysis.telegram_channel_id` if set
2. Else use `plan.telegram_channel_id` if analysis/trade is linked to a plan
3. Else use analyst's default channel from `telegram_channels`

### Broadcast Payload Format

**Correct payload format for edge function:**

```typescript
// For new analysis
{
  type: 'new_analysis',
  data: analysis,  // Full analysis object
  channelId: telegram_channel_id
}

// For new trade
{
  type: 'new_trade',
  data: trade,  // Full trade object
  channelId: channelId,
  isNewHigh: false
}
```

### Environment Requirements

For production broadcasting:
```env
NEXT_PUBLIC_SUPABASE_URL=<auto-configured>
SUPABASE_SERVICE_ROLE_KEY=<auto-configured>
TELEGRAM_BOT_TOKEN=<must-be-set>
APP_BASE_URL=https://yourdomain.com
```

---

## Symbol Query Feature

Users can send stock ticker symbols directly to the Telegram bot to instantly search for analyses.

### Features

- **Symbol normalization** (handles $AAPL, aapl, AAPL, etc.)
- **Rate limiting** (10 queries per 10 minutes)
- **Pagination** (10 results per page with Next/Previous buttons)
- **Direct links** to analysis pages
- **Multi-language support** (Arabic + English help messages)

### User Experience

#### Sending a Symbol Query

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

#### Example 2: Symbol with Pagination

```
📊 Analyses for TSLA
Found 27 analyses
Page 1 of 3

... (showing 10 total)

[1. Open] [2. Open]
[3. Open] [4. Open]
[5. Open] [6. Open]
[7. Open] [8. Open]
[9. Open] [10. Open]
[Next ➡️]
[🔍 Search on Website]
```

#### Example 3: No Results

```
📊 Analyses for XYZ

No analyses found for this symbol.

💡 Try another symbol or check the spelling.

[🔍 Search on Website]
```

### Symbol Validation Rules

- Remove leading `$` if present
- Trim whitespace
- Convert to uppercase
- Maximum 20 characters
- Only alphanumeric, dots (`.`), dashes (`-`), and underscores (`_`) allowed
- Support international symbols (e.g., `2222.SR` for Saudi stocks, `BRK.B` for Berkshire)

**Valid Examples**:
- `AAPL`, `$AAPL`, `TSLA`, `BRK.B`, `2222.SR`, `NVDA`

**Invalid Examples**:
- ` ` (empty), `THISISAVERYLONGSYMBOLNAME` (>20 chars), `AA#PL` (invalid character)

### Database Implementation

#### New Tables

**symbols**
- Added `symbol_normalized` column (uppercase, trimmed)

**analyses**
- Added `symbol_normalized` column (denormalized for performance)

**telegram_symbol_query_limits**
- Tracks user query timestamps for rate limiting
- Auto-cleanup of entries older than 10 minutes

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

### Testing

```bash
# Test symbol query
npm run test:telegram:symbol
```

---

## Subscription System

### Channel Subscription Flow

When a trader subscribes to an analyzer's plan, they automatically receive channel access:

#### For Traders (Subscribers)

1. **Find an Analyzer's Plan**
   - Browse to an analyzer's profile
   - View their subscription plans
   - Choose a plan to subscribe

2. **Provide Telegram Username**
   - Click "Subscribe Now"
   - If prompted, enter your Telegram username
   - Username format: No @ symbol (e.g., "john_doe" not "@john_doe")
   - Your username is saved for future subscriptions

3. **Receive Channel Invite**
   - Check your Telegram app
   - Bot will send you a direct message
   - Message contains private channel invite link
   - Link expires in 24 hours (use it promptly!)

4. **Join the Channel**
   - Click the invite link in Telegram
   - You'll be added to the private channel
   - Start receiving exclusive content

### Subscription Expiration

When a subscription expires:
1. User receives notification from bot
2. User is automatically removed from channel
3. User loses access to channel content
4. To regain access, renew subscription

### For Analyzers

#### Setting Up Telegram Channel Subscription

**Prerequisites:**
1. Create Telegram channel (private recommended)
2. Add the AnalyzingHub bot to your channel as admin
3. Grant bot permissions: Add new members, Ban/kick members, Create invite links

**Setup Steps:**
1. Create Subscription Plan in Dashboard → Settings → Plans
2. Link Telegram Channel to the plan
3. Verify bot has admin access
4. Activate the plan

#### How It Works Automatically

**When Someone Subscribes:**
1. System captures their Telegram username
2. Generates unique invite link
3. Bot sends DM with invite link
4. Subscriber joins your channel
5. You get notified of new subscriber

**When Subscription Expires:**
1. System detects expiration
2. Bot removes user from channel
3. User receives expiration notice
4. No manual intervention needed!

### Invite Link Delivery System

**Multi-Tier Delivery Approach:**

#### Tier 1: Direct DM (If Possible)
```typescript
// Check if user has chat_id (has started chat with bot)
const { data: telegramAccount } = await supabase
  .from('telegram_accounts')
  .select('chat_id')
  .eq('user_id', user.id)
  .is('revoked_at', null)
  .maybeSingle()

if (telegramAccount?.chat_id) {
  // Send DM directly
  await sendTelegramMessage(telegramAccount.chat_id, message)
}
```

#### Tier 2: Queue for Later Delivery
```typescript
else {
  // Queue message in outbox for when user links account
  await supabase.from('telegram_outbox').insert({
    message_type: 'channel_invite',
    channel_id: finalUsername,
    payload: { inviteLink, channelName, message },
    status: 'pending',
    priority: 10
  })
}
```

#### Tier 3: Display in UI (Always)
```typescript
// Always return invite link in API response
return NextResponse.json({
  inviteLink,  // Link available immediately
  channelName,
  inviteSent,
  message: inviteSent
    ? `Invite sent to Telegram`
    : `Click the invite link below to join ${channelName}`
})
```

### Username Management

**Service Role Policy for Username Updates:**

```sql
CREATE POLICY "Service role can update telegram username"
  ON profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
```

This allows the subscription API to update user profiles with their Telegram username during subscription creation.

### Database Schema

#### telegram_accounts
```sql
{
  user_id: uuid,
  chat_id: text,      -- Required for sending DMs
  username: text,
  linked_at: timestamp
}
```

#### telegram_memberships
```sql
{
  subscription_id: uuid,
  channel_id: text,
  status: 'pending' | 'invited' | 'joined' | 'kicked',
  invite_link: text
}
```

#### profiles
```sql
{
  telegram_username: text UNIQUE  -- Stores user's Telegram username
}
```

---

## Reports System

### Overview

A comprehensive daily trading reports system with Arabic/RTL support, PDF generation, automated scheduling, and multi-channel Telegram distribution.

### Core Features

1. **Multi-Language Support**
   - English reports
   - Arabic reports with proper RTL layout
   - Dual-language reports (English + Arabic in same document)
   - Automatic font loading (Cairo font for Arabic)

2. **Advanced Trade Classification**
   - Active trades (open on report date)
   - Closed trades (closed on report date)
   - Expired trades with special classification:
     - **Winner by +$100 Rule**: Expired trades that reached ≥$100 profit at any point
     - Regular expired trades
   - Accurate profit calculations from entry to highest price (not close price)

3. **Automated Generation & Distribution**
   - Scheduled daily generation (configurable time and timezone)
   - Auto-send to default and extra Telegram channels
   - Delivery tracking per channel
   - Failure handling and retry logic

4. **PDF Storage**
   - HTML reports stored in Supabase Storage
   - Signed URLs for secure access
   - Downloadable from UI
   - Attached to Telegram messages

### Database Tables

#### daily_trade_reports (Extended)
- Core report metadata
- File storage paths and URLs
- Generation status
- Metrics summary (JSON)
- Language mode
- Analyst/author information

#### report_deliveries
- Tracks each Telegram delivery attempt
- Channel information
- Success/failure status
- Error messages
- Telegram message IDs

#### report_settings
- Per-analyst configuration
- Enable/disable automation
- Language preferences
- Schedule time and timezone
- Default and extra channel IDs
- Last generation date

### Edge Functions

#### generate-advanced-daily-report
- Fetches trades for specified date
- Applies inclusion logic (active/closed/expired)
- Classifies expired trades using +$100 rule
- Calculates comprehensive metrics
- Generates HTML with RTL support
- Uploads to Supabase Storage
- Creates database record

#### auto-daily-reports-scheduler
- Runs via cron job (Mon-Fri at configured time)
- Queries enabled analyst settings
- Generates reports for each analyst
- Sends to configured Telegram channels
- Tracks delivery status
- Updates last_generated_date

### Trade Inclusion Logic

#### Active Trades
Trades that meet ALL criteria:
- `status = 'active'`
- `created_at <= report_date_end`

#### Closed Trades
Trades that meet ALL criteria:
- `status = 'closed'`
- `closed_at::date = report_date`

#### Expired Trades
Trades that meet ALL criteria:
- `expiry::date = report_date`

**Special Classification:**
- Calculate: `max_profit = (contract_high_since - entry_price) * qty * 100`
- If `max_profit >= $100`: Mark as "Winner by +$100 Rule"
- Else: Regular expired trade

### Profit Calculations

All profit calculations use the **highest price achieved after entry**, NOT the closing price:

```javascript
const entryPrice = entry_contract_snapshot.mid || entry_contract_snapshot.last
const highestPrice = contract_high_since || entryPrice
const qty = qty || 1
const multiplier = 100

// Dollar profit
const maxProfitDollar = (highestPrice - entryPrice) * qty * multiplier

// Percentage profit
const maxProfitPercent = ((highestPrice - entryPrice) / entryPrice) * 100

// Win classification
const isWinner = maxProfitDollar >= 100
```

### Report Content

#### Header Section
- Gradient branded header
- Report title (bilingual if dual mode)
- Report date (localized)
- Generation timestamp

#### Statistics Grid
Seven key metrics:
1. Total Trades
2. Active Trades
3. Closed Trades
4. Expired Trades
5. Average Profit %
6. Maximum Profit %
7. Win Rate %

#### Trades Section
Detailed cards for each trade showing:
- Symbol and option type
- Strike price
- Entry price
- Highest price achieved
- Current price
- Max profit ($ and %)
- Status (including expired classifications)

### Arabic/RTL Support

#### Implementation Details

1. **Font Loading**
   - Cairo font loaded via Google Fonts CDN
   - Embedded in HTML head
   - Applied to all Arabic text

2. **Direction Attribute**
   - `<html dir="rtl">` for Arabic mode
   - `<html dir="ltr">` for English mode
   - Dual mode uses LTR with bilingual text

3. **Text Alignment**
   - Dynamic alignment based on language
   - Margins and padding adjusted for RTL
   - Border positions (left/right) swapped

### Usage Guide

#### Manual Generation

1. Go to Dashboard → Reports
2. Select date from calendar
3. Choose language mode (EN/AR/Dual)
4. Click "Preview" to test (dry-run)
5. Click "Generate" to create report
6. Download or send to Telegram

#### Automation Configuration

1. Navigate to Reports → Settings
2. Enable "Automated Daily Reports"
3. Set preferred language mode
4. Configure schedule time (e.g., 16:30)
5. Select timezone (e.g., Asia/Riyadh)
6. Choose default channel
7. Add extra channels (optional)
8. Save settings

### Cron Schedule

Default: Monday-Friday at 13:30 UTC (4:30 PM Riyadh time)

To modify:
```sql
SELECT cron.unschedule('auto-daily-reports-generator');

SELECT cron.schedule(
  'auto-daily-reports-generator',
  '30 16 * * 1-5', -- 4:30 PM UTC
  $$...$$
);
```

### API Routes

#### POST /api/reports/generate
- Manual report generation
- Parameters: date, language_mode, dry_run
- Returns: report_id, file_url, metrics
- Auth: Analyzer or Admin role required

#### POST /api/reports/send
- Send generated report to Telegram
- Parameters: report_id, channel_ids (optional)
- Auto-detects channels if not specified
- Returns: per-channel delivery results

#### GET /api/reports
- List generated reports
- Filtering: date, language, status
- Pagination support
- Includes delivery status

#### GET /api/reports/settings
- Fetch current settings for logged-in analyst

#### PUT /api/reports/settings
- Update automation settings
- Configure schedule, language, channels

### Report Formatting

**Number Formatting Fix:**

All numeric values wrapped with `Number()` before calling `.toFixed(1)`:

```typescript
// Correct formatting
<p>{Number(report.summary.win_rate || 0).toFixed(1)}%</p>

// Shows: 83.3% (not 83.33333333333334%)
```

**PDF Download Feature:**

```typescript
const downloadPDF = async (report: Report) => {
  // Fetch HTML content
  const htmlResponse = await fetch(report.file_url)
  const htmlContent = await htmlResponse.text()

  // Create blob and download
  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)

  // Trigger download and print dialog
  const link = document.createElement('a')
  link.download = `report-${report.report_date}.html`
  link.click()

  // Open print dialog for PDF saving
  const printWindow = window.open(url, '_blank')
  printWindow.onload = () => printWindow.print()
}
```

---

## Daily Reports

### Daily Trade Report Quick Start

A complete end-of-day trading report system that:

✅ **Tracks Max Profit** - Every trade remembers its peak profit (highest point reached)
✅ **Identifies Winners** - Automatically marks trades with $100+ profit as "winning trades"
✅ **Sends Telegram Notifications** - Three messages per channel at market close:
  - 🎯 Winning trades (max profit > $100)
  - ⚠️ Losing trades (current loss > $20)
  - 📊 Daily summary with full statistics

✅ **Beautiful HTML Reports** - Styled tables with gradient headers and color-coded profits
✅ **Automated Scheduling** - Runs daily at 4:15 PM ET (after market close)

### Winning Trade Definition

```
A trade is "winning" if max_profit > $100 at ANY point during its lifetime
```

Example:
- Entry: $2.50
- Peaked at: $4.00 → Max Profit = $150 ✅ WINNING
- Current: $3.50 → Still marked as winning forever!

### What Gets Sent to Telegram

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

### Database Changes

New columns in `index_trades`:
- `max_profit` - Highest profit reached ($)
- `max_contract_price` - Peak contract price
- `profit_from_entry` - Current profit/loss
- `is_winning_trade` - Boolean (true if max profit > $100)
- `trade_outcome` - Enum: big_win, small_win, breakeven, small_loss, big_loss
- `daily_notified_at` - Timestamp of notification

### Testing

```bash
# Test the daily report system
npm run test:daily-report
```

### Schedule Daily Reports

**Option A: Supabase Dashboard** (Recommended)
1. Go to Supabase dashboard
2. Database → Cron Jobs → Create
3. Schedule: `15 20 * * 1-5` (Mon-Fri, 4:15 PM ET)
4. Command:
```sql
SELECT net.http_post(
  url := 'https://YOUR_PROJECT.supabase.co/functions/v1/indices-daily-report-sender',
  headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
);
```

---

## Indices Hub Integration

### Overview

Comprehensive Telegram integration and automated trade lifecycle system for Analyzinghub's Indices Hub feature.

### Database Schema Enhancements

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

#### Telegram Outbox (`telegram_outbox` table)
Reliable message delivery with retry logic:
- `id` - Unique message ID
- `message_type` - Type: 'new_analysis', 'new_trade', 'trade_result', etc.
- `payload` - JSONB message data
- `channel_id` - Telegram channel ID
- `status` - 'pending', 'processing', 'sent', 'failed', 'canceled'
- `priority` - Message priority (1-10, default: 5)
- `retry_count` - Current retry attempt
- `max_retries` - Maximum retry attempts (default: 3)
- `next_retry_at` - Next retry timestamp (exponential backoff)

### Automated Trade Status Rules

#### $100 Success Threshold
- **Rule**: When net PnL reaches $100 USD, trade is marked as "succeed"
- **Calculation**: `(current_price - entry_price) * multiplier * qty >= 100`
- **Status**: Changes to "closed" with outcome "succeed"
- **Priority**: Checked BEFORE traditional targets

#### Expiration Handling
- **Rule**: When `expiry_datetime` passes, trade is marked as "expired"
- **P/L Calculation**: If current price > 0, calculate final P/L; otherwise, full loss
- **Outcome**: "succeed" if positive P/L, "expired" if zero/negative

### Edge Functions

#### indices-trade-tracker
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

#### telegram-outbox-processor
**Purpose**: Process pending Telegram messages with retry logic
**Schedule**: Every 2 minutes
**Features**:
- Fetches pending messages from outbox
- Formats bilingual messages (English + Arabic)
- Sends to Telegram Bot API
- Implements exponential backoff (2^n * 60 seconds)
- Max 3 retries before marking as failed

### Bilingual Message Formats

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

### Testing

```bash
# Test indices Telegram integration
npm run test:indices:telegram
```

This diagnostic script will:
- Check if edge function is deployed
- Find your most recent trade
- Verify telegram channels are configured
- Test sending a message to the edge function
- Show exactly what's failing

---

## Resend Features

### Resend Analysis to Telegram Channels

Analyzers can now send their analyses to any of their connected Telegram channels, enabling multi-channel distribution and flexible content management.

### Features

✅ **Multiple Channels** - Send the same analysis to multiple channels
✅ **Selective Broadcasting** - Choose exactly which channel receives the analysis
✅ **No Duplication Check** - You can resend to the same channel multiple times
✅ **Instant Delivery** - Messages are sent immediately
✅ **Full Formatting** - All charts, targets, and formatting preserved

### User Flow

1. **View Your Analysis**
   - Navigate to any of your published analyses
   - Open the analysis detail page

2. **Resend to Channel**
   - Look for the action buttons at the top
   - Click the **🔁 Resend** button
   - Dialog opens showing all your connected channels

3. **Select Target Channel**
   - Choose from: Public, Followers, or Subscribers channels
   - Each channel shows name, ID, and audience type badge

4. **Send**
   - Click "Send to Channel"
   - Success message confirms delivery

### API Endpoint

```
POST /api/analyses/[id]/resend-to-channel
Body: { channelId: "uuid" }
```

### Use Cases

1. **Multi-Tier Content Strategy**
   - Same Analysis → Different Channels
   - Public Channel: Basic summary
   - Followers Channel: Detailed analysis
   - Premium Channel: Exclusive insights

2. **Cross-Posting**
   - High-value analysis → Send to multiple channels

3. **Testing**
   - Test new channel setup with existing analysis

4. **Reposting**
   - Market conditions similar to old analysis → Resend with context

### Security

✅ **Authentication Required** - Must be logged in
✅ **Ownership Validation** - Only author can resend their analyses
✅ **Channel Validation** - Can only send to own channels
✅ **Enabled Check** - Channel must be active

---

## Troubleshooting

### Bot Not Responding

**Issue**: Bot doesn't respond to commands

**Solutions**:
1. Verify bot token is correct
2. Check webhook status using `getWebhookInfo`
3. Ensure webhook URL is accessible from Telegram servers
4. Check application logs for errors
5. Run: `npm run telegram:status`

### Notifications Not Being Received

**Issue**: Users don't receive notifications

**Solutions**:
1. Verify Telegram account is linked (Settings → Telegram)
2. Check notification preferences are enabled
3. Ensure not in quiet hours
4. Check rate limits haven't been exceeded
5. Review delivery logs in database (`notification_delivery_log` table)

### Channel Broadcasts Not Sending

**Issue**: Analyses not broadcast to channels

**Solutions**:
1. **Check channel verification**:
   ```sql
   SELECT id, channel_name, verified_at, enabled
   FROM telegram_channels
   WHERE user_id = 'YOUR_USER_ID';
   ```
   - Ensure `verified_at IS NOT NULL`
   - Ensure `enabled = true`
   - Ensure `notify_new_analysis = true`

2. **Check broadcast endpoint**:
   - Look for console logs: `TELEGRAM_BROADCAST_START`, `TELEGRAM_BROADCAST_RESULT`
   - Check edge function logs in Supabase Dashboard

3. **Verify bot permissions**:
   - Bot must be admin in channel
   - Bot must have "Post Messages" permission

4. **Check payload format**:
   - Must send full analysis/trade object in `data` field
   - Must include `channelId` as Telegram channel ID

### Symbol Query Not Working

**Issue**: Ticker symbol searches fail

**Solutions**:
1. Verify webhook is active
2. Check `symbol_normalized` columns exist and are populated
3. Run: `npm run test:telegram:symbol`
4. Check rate limits (10 queries per 10 minutes)

### Reports Not Generating

**Issue**: Reports fail to generate

**Solutions**:
1. Check analyst role (must be Analyzer or SuperAdmin)
2. Verify trades exist for selected date:
   ```sql
   SELECT COUNT(*) FROM index_trades
   WHERE created_at::date = 'YYYY-MM-DD';
   ```
3. Check edge function logs in Supabase dashboard
4. Ensure storage bucket exists and is accessible

### Arabic Text Not Displaying

**Issue**: Arabic text shows as squares or incorrect characters

**Solutions**:
1. Verify Cairo font is loading (check HTML head)
2. Ensure proper RTL direction attribute: `<html dir="rtl">`
3. Check browser font support
4. Test with different browsers
5. Verify HTML has proper UTF-8 encoding

### Subscription Invites Not Sending

**Issue**: Subscribers don't receive channel invite links

**Solutions**:
1. **Check invite link creation**:
   ```sql
   SELECT * FROM telegram_memberships
   WHERE subscription_id = 'sub_id';
   ```
   - Verify `invite_link` is populated
   - Check `status` is 'invited'

2. **Check outbox for pending messages**:
   ```sql
   SELECT * FROM telegram_outbox
   WHERE message_type = 'channel_invite'
   AND status = 'pending';
   ```

3. **Verify bot can send DMs**:
   - User must have started chat with bot first
   - Check privacy settings allow bot messages

4. **UI fallback**:
   - Invite link always shown in success toast
   - Users can click "Join Channel" button

### Cron Jobs Not Running

**Issue**: Automated tasks not executing

**Solutions**:
1. **Check cron job status**:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE '%telegram%';
   ```

2. **Check recent runs**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%telegram%')
   ORDER BY start_time DESC LIMIT 10;
   ```

3. **Verify edge functions are deployed**:
   - Check Supabase Dashboard → Edge Functions
   - Ensure all functions show as "Active"

4. **Manual trigger for testing**:
   ```bash
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/FUNCTION_NAME' \
     -H 'Authorization: Bearer YOUR_SERVICE_KEY'
   ```

---

## API Reference

### Telegram API Routes

#### POST /api/telegram/link-code
Generate a linking code for users to connect their Telegram account.

**Response**:
```json
{
  "code": "ABC123XY",
  "expires_at": "2025-01-15T12:00:00Z"
}
```

#### POST /api/telegram/webhook
Webhook endpoint for receiving Telegram bot updates.

**Headers**:
- `x-telegram-bot-api-secret-token`: Webhook secret

#### POST /api/telegram/disconnect
Unlink user's Telegram account.

#### GET /api/telegram/status
Check if user's Telegram account is linked.

**Response**:
```json
{
  "linked": true,
  "username": "@johndoe",
  "linked_at": "2025-01-10T10:00:00Z"
}
```

### Channel API Routes

#### GET /api/telegram/channel/status
Check channel connection status.

**Response**:
```json
{
  "channels": [{
    "id": "uuid",
    "channel_id": "-1001234567890",
    "channel_name": "My Channel",
    "audience_type": "public",
    "enabled": true,
    "verified_at": "2025-01-10T10:00:00Z"
  }]
}
```

#### POST /api/telegram/channel/connect
Connect a new Telegram channel.

**Body**:
```json
{
  "channel_id": "-1001234567890",
  "channel_name": "My Channel",
  "audience_type": "public"
}
```

#### POST /api/telegram/channel/disconnect
Disconnect a Telegram channel.

**Body**:
```json
{
  "channel_id": "uuid"
}
```

#### POST /api/telegram/channel/broadcast-new-analysis
Broadcast a new analysis to specified channel.

**Body**:
```json
{
  "analysisId": "uuid",
  "userId": "uuid",
  "channelId": "-1001234567890"
}
```

### Reports API Routes

#### POST /api/reports/generate
Generate a new report.

**Body**:
```json
{
  "date": "2025-01-15",
  "language_mode": "dual",
  "dry_run": false
}
```

**Response**:
```json
{
  "report_id": "uuid",
  "file_url": "https://...",
  "summary": {
    "total_trades": 10,
    "win_rate": 75.0,
    "net_profit": 1250.00
  }
}
```

#### POST /api/reports/send
Send report to Telegram channels.

**Body**:
```json
{
  "report_id": "uuid",
  "channel_ids": ["uuid1", "uuid2"]
}
```

**Response**:
```json
{
  "deliveries": [{
    "channel_id": "uuid",
    "channel_name": "My Channel",
    "status": "sent",
    "telegram_message_id": "123"
  }]
}
```

#### GET /api/reports
List generated reports.

**Query Parameters**:
- `date`: Filter by date (YYYY-MM-DD)
- `language`: Filter by language mode (en/ar/dual)
- `status`: Filter by status
- `page`: Page number
- `limit`: Results per page

**Response**:
```json
{
  "reports": [{
    "id": "uuid",
    "report_date": "2025-01-15",
    "language_mode": "dual",
    "status": "completed",
    "file_url": "https://...",
    "summary": {...}
  }],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50
  }
}
```

#### GET /api/reports/settings
Get report settings for current user.

**Response**:
```json
{
  "enabled": true,
  "language_mode": "dual",
  "schedule_time": "16:30",
  "timezone": "Asia/Riyadh",
  "default_channel_id": "uuid",
  "extra_channel_ids": ["uuid1", "uuid2"]
}
```

#### PUT /api/reports/settings
Update report settings.

**Body**:
```json
{
  "enabled": true,
  "language_mode": "dual",
  "schedule_time": "16:30",
  "timezone": "Asia/Riyadh",
  "default_channel_id": "uuid",
  "extra_channel_ids": ["uuid1", "uuid2"]
}
```

### Symbol Query API

#### POST /api/telegram/query-symbol
Query analyses by symbol (internal API).

**Headers**:
- `x-telegram-bot-api-secret-token`: Webhook secret

**Body**:
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
  "analyses": [{
    "analysis_id": "uuid",
    "analyzer_name": "John Trader",
    "title": "AAPL Bullish Setup",
    "direction": "Long",
    "created_at": "2026-01-20T10:00:00Z",
    "total_count": 27
  }],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalCount": 27,
    "pageSize": 10
  }
}
```

### Resend API

#### POST /api/analyses/[id]/resend-to-channel
Resend an analysis to a specific channel.

**Body**:
```json
{
  "channelId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Analysis sent to Premium Channel",
  "channelName": "Premium Channel"
}
```

---

## Conclusion

This comprehensive guide consolidates all Telegram bot and reports documentation for AnalyzingHub. The system provides:

✅ **Complete Bot Integration** - Personal notifications, channel broadcasting, and symbol queries
✅ **Automated Subscription Management** - Channel access control with invite link delivery
✅ **Professional Reports** - Multi-language HTML/PDF reports with automated delivery
✅ **Indices Hub Support** - Real-time trade tracking with Telegram notifications
✅ **Flexible Broadcasting** - Multi-channel support with resend capabilities
✅ **Comprehensive API** - Well-documented endpoints for all features

### Key Components

- **Edge Functions**: 10+ functions for automation and message processing
- **API Routes**: 20+ endpoints for all Telegram and reports features
- **Database Tables**: 15+ tables for tracking everything
- **Cron Jobs**: Automated scheduling for reports and trade tracking
- **UI Components**: Complete dashboards for management and configuration

### Support

For issues or questions:
1. Check the troubleshooting section above
2. Review relevant API documentation
3. Check edge function logs in Supabase Dashboard
4. Run diagnostic scripts: `npm run test:telegram:*`
5. Verify environment variables are correctly set

### Testing Commands

```bash
# Telegram
npm run telegram:status      # Check bot status
npm run telegram:menu        # Set up bot menu
npm run test:telegram:symbol # Test symbol query

# Reports
npm run test:daily-report    # Test daily reports
npm run test:pdf-report      # Test PDF generation

# Indices
npm run test:indices:telegram # Test indices integration

# Resend
npm run test:resend-channel  # Test resend feature
```

---

**Built for AnalyzingHub** | **Last Updated**: February 2026
