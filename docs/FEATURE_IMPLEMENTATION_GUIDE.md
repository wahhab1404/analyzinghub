# Feature Implementation Guide
## AnalyZHub Platform - Comprehensive Implementation Reference

> **Last Updated:** February 2026
> **Version:** 2.0
> **Purpose:** Complete reference for all implemented features across the platform

---

## Table of Contents

1. [Trading System Features](#1-trading-system-features)
2. [Indices Hub System](#2-indices-hub-system)
3. [Subscription & Monetization](#3-subscription--monetization)
4. [Reports & Analytics](#4-reports--analytics)
5. [Rankings & Recommendations](#5-rankings--recommendations)
6. [Internationalization](#6-internationalization)
7. [Analysis & Content Management](#7-analysis--content-management)
8. [Media & Image Generation](#8-media--image-generation)
9. [Financial Management](#9-financial-management)
10. [Platform Core Features](#10-platform-core-features)

---

## 1. Trading System Features

### 1.1 Manual Trade Features

#### Overview
Quick manual trade entry system for adding trades with essential information only. System automatically calculates profit percentages and dollar amounts.

#### Key Features
- **Quick Entry**: Add trades with just Index, Strike, Entry, and High
- **Auto-Calculation**: Automatic profit computation (% and $)
- **Status Detection**: Auto-marks as Winner if profit >= $100
- **No Telegram Spam**: Manual entries don't trigger notifications
- **Entry Snapshot**: Creates full contract snapshot automatically

#### Technical Implementation

**API Endpoint:**
```typescript
POST /api/indices/trades/manual
Body: {
  index_symbol: "SPX",
  strike: 6900,
  entry_price: 3.50,
  high_price: 7.00,
  direction: "call"
}
```

**Database Fields:**
```sql
- is_manual_entry: true
- telegram_send_enabled: false
- entry_contract_snapshot: JSONB (full data)
```

**Calculations:**
```typescript
profitPercent = ((high - entry) / entry) * 100
profitDollars = (high - entry) * 100 * qty
isWinner = profitDollars >= 100
```

**Components:**
- `components/indices/QuickManualTradeDialog.tsx` - Entry form
- `components/indices/TradesList.tsx` - Integration point

#### Manual High Adjustment

**Purpose:** Update high watermark manually (market closed, data delays, testing)

**API Endpoint:**
```typescript
POST /api/indices/trades/[id]/manual-price
Body: {
  manualPrice: 8.50,      // Optional
  manualHigh: 9.00        // Optional
}
```

**Behavior:**
- Market Open: Triggers Telegram notification with snapshot
- Market Closed: Updates database only, no notifications
- Detects new highs and winner status
- Marks as `is_using_manual_price: true`

**Component:** `components/indices/ManualHighUpdateDialog.tsx`

---

### 1.2 Canonical Trade System

#### Overview
Complete refactored trade system with high watermark tracking and canonical profit calculations.

#### Core Principles
1. **High Watermark Tracking**: Maximum price since entry (never decreases)
2. **Canonical Win Rule**: max_profit >= $100 → WIN (persists forever)
3. **Canonical Finalization**: WIN → pnl = max_profit | LOSS → pnl = -total_cost
4. **Idempotency**: Prevents double counting with `counted_in_stats` flag

#### Database Schema

**Key Fields:**
```sql
ALTER TABLE index_trades ADD COLUMN:
  max_contract_price NUMERIC(10, 4)    -- High watermark
  max_profit NUMERIC(12, 2)            -- Peak profit dollars
  entry_cost_usd NUMERIC(12, 2)        -- Total entry cost
  counted_in_stats BOOLEAN             -- Idempotency flag
  is_winning_trade BOOLEAN             -- >= $100 threshold
  win_at TIMESTAMPTZ                   -- When first won
  profit_from_entry NUMERIC(12, 2)    -- Current profit
```

#### Core Functions

**1. Update High Watermark:**
```sql
CREATE OR REPLACE FUNCTION update_trade_high_watermark(
  p_trade_id UUID,
  p_current_price NUMERIC
) RETURNS JSONB;
```

Logic:
- Never reduces high watermark
- WIN status persists (never downgrades)
- Records exact moment of WIN
- Updates live profit for display

**2. Canonical Finalization:**
```sql
CREATE OR REPLACE FUNCTION finalize_trade_canonical(
  p_trade_id UUID
) RETURNS JSONB;
```

Logic:
```sql
max_profit_dollars = (high_watermark - entry_price) * qty * multiplier
max_profit_dollars = GREATEST(0, max_profit_dollars)

IF max_profit_dollars >= 100 THEN
  final_pnl = max_profit_dollars  -- Use high watermark
  outcome = 'win'
ELSE
  final_pnl = -entry_cost_usd     -- Total loss
  outcome = 'loss'
END IF
```

#### Edge Function Integration

**File:** `supabase/functions/indices-trade-tracker/index.ts`

**Changes:**
- Uses `update_trade_high_watermark` for all price updates
- Uses `finalize_trade_canonical` for expiration
- Sends WIN notification when `newly_won = true`
- Preserves high watermark logic

**Deployment Status:** ✅ Deployed and active

---

### 1.3 Trade Re-Entry System

#### Overview
Comprehensive system for handling re-entering the same contract with user choice between NEW_ENTRY and AVERAGE_ADJUSTMENT.

#### Database Schema

**New Table:** `index_trade_events`
```sql
CREATE TABLE index_trade_events (
  id UUID PRIMARY KEY,
  trade_id UUID REFERENCES index_trades(id),
  author_id UUID REFERENCES profiles(id),
  event_type TEXT, -- REENTER_NEW_ENTRY_CLOSE, REENTER_NEW_ENTRY_CREATE, AVERAGE_ADJUSTMENT
  event_data JSONB,
  created_at TIMESTAMPTZ
);
```

**New Fields:**
```sql
ALTER TABLE index_trades ADD COLUMN:
  idempotency_key TEXT UNIQUE,
  averaged_times INTEGER DEFAULT 0,
  original_entry_price NUMERIC,
  entries_data JSONB DEFAULT '[]'
```

#### Business Rules

**Same Contract Definition:**
- Same `author_id`
- Same `polygon_option_ticker` (exact match)
- OR: Same strike + expiry + option_type + underlying_symbol
- Existing trade `status = 'active'`

**NEW_ENTRY Closure Rules:**
```
IF max_profit_dollars >= 100:
  outcome = WIN
  pnl_dollars = max_profit_dollars
ELSE:
  outcome = LOSS
  pnl_dollars = -entry_cost_usd
```

**AVERAGE_ADJUSTMENT Calculation:**
```
avg_entry_price = (old_entry × old_qty + new_entry × new_qty) / (old_qty + new_qty)
combined_qty = old_qty + new_qty
new_total_cost = avg_entry_price × combined_qty × multiplier

-- Preserve high watermark
high_watermark_price = GREATEST(existing_high, current_high)
max_profit_dollars = MAX(0, (high_watermark_price - avg_entry_price) × combined_qty × multiplier)

-- Maintain WIN status
IF max_profit_dollars >= 100 OR already_is_win:
  is_win = true
```

#### API Flow

**Phase 1: Detection**
```typescript
POST /api/indices/trades
// Check for active trade on same contract
if (activeTradeFound) {
  return 409 {
    action_required: 'REENTRY_DECISION',
    existing_trade: {...},
    new_trade: {...},
    idempotency_key: '...'
  }
}
```

**Phase 2: Decision Processing**
```typescript
POST /api/indices/trades
Body: {
  reentry_decision: 'NEW_ENTRY' | 'AVERAGE_ADJUSTMENT',
  existing_trade_id: 'uuid',
  idempotency_key: 'key'
}
```

**Database Functions:**
```sql
process_trade_new_entry(p_existing_trade_id, p_new_trade_data, p_idempotency_key)
process_trade_average_adjustment(p_existing_trade_id, p_new_entry_price, p_new_qty, p_idempotency_key)
```

**Component:** `components/indices/TradeReentryDialog.tsx`

**Idempotency:**
- Unique constraint on `idempotency_key`
- FOR UPDATE lock during processing
- Event-based deduplication for adjustments
- Single atomic transaction

---

### 1.4 Trade Snapshot System

#### Overview
Professional Robinhood-style contract snapshots with automatic generation and Telegram delivery.

#### Architecture

**Two-Layer System:**
1. **Backend Price Tracker** (Every 1 minute via Cron)
   - Checks active trades for target/stoploss hits
   - Detects new highs and generates snapshots
   - Sends Telegram alerts with images
   - Located: `supabase/functions/indices-trade-tracker/`

2. **Frontend Real-Time Updates** (Every 5 seconds via SSE)
   - Streams live prices to browser
   - Uses Server-Sent Events (SSE)
   - Located: `realtime-pricing-service/`

#### Snapshot Design

**Visual Style:**
- Clean Robinhood-inspired design
- Large price display (140px font)
- Color-coded: Green for gains, Red for losses
- Shows: Strike, Expiry, Option Type, Open Interest, Volume
- Underlying index price with percentage change
- "NEW HIGH" badge when contract reaches new peak

**Specs:**
- Size: 1280x720 pixels (HD)
- Format: PNG
- Generated via: Screenshot API / ApiFlash
- Stored: Supabase Storage (`chart-images` bucket)

#### When Snapshots Are Generated

1. **On Trade Publish** - Immediately when creating new trade
2. **On New High Detection** - Every time contract price hits new high
3. **On Target Hit** - When price reaches target level
4. **On Stop Loss Hit** - Final snapshot before trade closes

#### Implementation

**Edge Function:** `supabase/functions/generate-trade-snapshot/index.ts`

**Service:** `services/indices/snapshot-generator.service.ts`

**API:** `app/api/indices/snapshot/route.ts`

**Cron Schedule:**
```sql
SELECT cron.schedule(
  'indices-trade-tracker',
  '* * * * *',  -- Every 1 minute
  $$SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/indices-trade-tracker',
    headers:='{"Authorization": "Bearer YOUR_KEY"}'::jsonb
  ) as request_id;$$
);
```

---

### 1.5 Target Hit & Success Implementation

#### Overview
System where ANY price target hit automatically marks analysis as SUCCESSFUL with proper state management and scoring.

#### Database Schema

**New Fields:**
```sql
ALTER TABLE analyses ADD COLUMN:
  success_at TIMESTAMPTZ,
  success_reason TEXT,
  first_hit_target_id UUID,
  success_counted BOOLEAN DEFAULT false
```

**Function:**
```sql
CREATE OR REPLACE FUNCTION finalize_analysis_success(
  p_analysis_id UUID
) RETURNS JSONB;
```

Logic:
- Updates analysis status to SUCCESS
- Records success metadata (timestamp, reason, target)
- Awards points to analyzer (with idempotency)
- Updates analyzer profile stats
- Prevents double counting via `success_counted` flag
- Prevents overriding FAILED status

#### Target Evaluation Engine

**File:** `supabase/functions/analysis-target-checker/index.ts`

**Features:**
- Direction normalization: LONG, SHORT, BUY, SELL, CALL, PUT
- Session-aware price basis (pre-market, regular hours, after-hours)
- Epsilon-based comparisons (±$0.01) for float precision
  - LONG: `high >= target - 0.01`
  - SHORT: `low <= target + 0.01`
- Cascade rules: Targets must be hit in order
- Extended hours support
- First target hit triggers success
- Idempotency checking

**Cron Schedule:** Every 5 minutes

#### UI Styling

**Status Display Function:** `lib/analysis-status-styles.ts`

```typescript
export function getAnalysisStatusDisplay(status: string): AnalysisStatusDisplay {
  // Returns badgeText, color, borderClass, bgClass, textClass, badgeVariant
}
```

**Badge Component:** `components/ui/badge.tsx`
```typescript
success: 'border-transparent bg-green-500 text-white hover:bg-green-600'
```

**Applies To:**
- Feed view
- Profile view
- Symbol view
- Search results
- Analysis detail page
- Indices hub

---

### 1.6 Success Rate & Trading Stats

#### Overview
Comprehensive success rate tracking and public profile statistics for analyzers.

#### Database Function

```sql
CREATE OR REPLACE FUNCTION get_analyzer_stats(p_user_id UUID)
RETURNS TABLE (
  total_analyses INTEGER,
  active_analyses INTEGER,
  completed_analyses INTEGER,
  successful_analyses INTEGER,
  success_rate NUMERIC,
  followers_count INTEGER,
  following_count INTEGER
);
```

**Success Rate Formula:**
```
Success Rate = (Analyses with target_hit / Completed analyses) × 100
Completed = target_hit + stop_hit
```

#### Dashboard Display

**Personal Performance Overview:**
- Total Analyses
- Active Analyses
- Successful Analyses
- Success Rate (color-coded)
  - Green: ≥70% (Excellent)
  - Yellow: 50-69% (Good)
  - Red: <50% (Needs improvement)
- Followers
- Following

#### Public Profiles

**7-Stat Dashboard:**
1. Total Analyses (Blue icon)
2. Active Analyses (Orange icon)
3. Successful Analyses (Green icon)
4. Success Rate (Purple icon, dynamic color)
5. Followers (Pink icon)
6. Following (Cyan icon)
7. Completed Analyses (Gray icon)

#### Trading Stats API

**Endpoint:** `app/api/profiles/[id]/trading-stats/route.ts`

**Response:**
```json
{
  "totalClosedTrades": 50,
  "winningTrades": 35,
  "losingTrades": 15,
  "winRate": 70.0,
  "totalProfit": 15000.00,
  "averageWin": 500.00,
  "averageLoss": -250.00,
  "maxProfit": 2000.00,
  "maxLoss": -800.00
}
```

**Component:** `components/rankings/ProfileStats.tsx`

---

### 1.7 Trade Advertisement Feature

#### Overview
Allows analyzers to send successful trades as advertisements to their own Telegram channels.

#### Features

**Personal Advertisement Channels:**
- Each analyzer manages their own ad channels
- Add/remove Telegram channels
- Enable/disable channels
- Public channels (@channelname) or Private (-100123456789)

**Send Trade Advertisements:**
- Available for trades with positive profit
- Analyzer can only advertise their own trades
- Formatted Arabic message with:
  - Index symbol
  - Contract details (Strike, Expiry, Option Type)
  - Entry price and highest price
  - Profit in dollars and percentage
  - Contract snapshot image

**Message Format (Arabic):**
```
🎯 تحليل ناجح

المؤشر: SPX
العقد: 6900 - 01/31 - PUT

💰 النتائج:
سعر الدخول: $4.00
أعلى سعر: $4.40
المكسب: $40.00 (+10.0%)

✅ انضم لقناتنا للحصول على التحليلات الفائزة!
```

#### Database Schema

```sql
CREATE TABLE telegram_ad_channels (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),  -- Owner
  channel_id TEXT,                        -- Telegram ID/username
  channel_name TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,

  UNIQUE (user_id, channel_id)
);
```

#### API Endpoints

**Get Ad Channels:**
```
GET /api/telegram/ad-channels
Returns: Only channels belonging to authenticated user
```

**Add Ad Channel:**
```
POST /api/telegram/ad-channels
Body: { "channelId": "@channel", "channelName": "My Channel" }
```

**Send Trade Advertisement:**
```
POST /api/telegram/send-trade-ad
Body: { "tradeId": "uuid", "channelIds": ["@channel1", "-100123456789"] }
```

**Edge Function:** `supabase/functions/send-trade-advertisement`

**UI Components:**
- `components/settings/AdChannelsSettings.tsx` - Channel management
- `components/indices/SendTradeAdDialog.tsx` - Send dialog
- `components/indices/TradesList.tsx` - Purple "Send" button

---

## 2. Indices Hub System

### 2.1 Overview

Complete standalone system for publishing and tracking index options/futures trades with real-time price updates.

**Supported Indices:**
- S&P 500 (SPX)
- NASDAQ 100 (NDX)
- Dow Jones (DJI)

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      NETLIFY (Next.js)                       │
│  • CRUD APIs for analyses/trades                            │
│  • Polygon snapshot on publish                              │
│  • File uploads to Supabase Storage                         │
│  • NO long-lived connections                                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              REALTIME PRICING SERVICE (Fly.io)               │
│  • SSE streaming to browser clients                         │
│  • Polygon WebSocket (indices) + REST (options)             │
│  • Redis for fast state management                          │
│  • Periodic persistence to Supabase                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Database Schema

**Core Tables:**
1. `indices_reference` - Master data for SPX, NDX, DJI
2. `index_analyses` - Chart analyses published by analysts
3. `index_trades` - Trade recommendations with live tracking
4. `analysis_updates` - Timeline of updates to analyses
5. `trade_updates` - Timeline of updates to trades

**Key Features:**
- Complete RLS policies (role + subscription based)
- Optimized indexes for common queries
- JSONB columns for flexible nested data
- Foreign key constraints with cascading
- Triggers for timestamp updates

### 2.4 Core Features

#### Create Index Analyses
- Chart analyses for indices
- Similar to stock analyses
- Index-specific parameters
- Link to tradable contracts

#### Create Index Trades

**Trade Types:**
- Call options (bullish)
- Put options (bearish)
- Strike price selection
- Expiration date selection
- Premium tracking

**Trade Management:**
- Real-time price tracking
- Profit/loss calculation
- High/low since entry
- Trade status updates (Draft, Active, TP Hit, SL Hit, Closed, Expired)

#### Live Tracking Features
- Real-time underlying index price
- Real-time contract price
- Options chain integration
- High/low tracking
- Profit percentage and dollar calculations

#### Trade Monitoring System

**Workflow:**
1. Analyst creates trade
2. System fetches Polygon snapshot
3. Stores entry prices
4. Real-time service monitors prices
5. Detects targets/stops
6. Generates snapshots on milestones
7. Sends Telegram notifications

### 2.5 Polygon Integration

**Service Layer:** `services/indices/polygon.service.ts`

**Methods:**
- `getIndexSnapshot(ticker)` - Current index value
- `getOptionSnapshot(underlying, ticker)` - Option premium
- `getOptionsChain(filters)` - Browse contracts
- `getExpirationDates(underlying)` - List expiry dates

**API Conventions:**
- Indices REST: `/v3/snapshot/indices/I:SPX`
- Indices WebSocket: Subscribe to `I:SPX`, `I:NDX`, `I:DJI`
- Options REST: `/v3/snapshot/options/SPX/O:SPX251219C05900000`

### 2.6 Realtime Pricing Service

**Location:** `/realtime-pricing-service/`

**Components:**
- `src/index.ts` - Main server
- `src/subscription-manager.ts` - Viewer tracking
- `src/polygon-fetcher.ts` - Polygon WebSocket/REST integration
- `src/sse-handler.ts` - SSE connection management
- `src/persistence-service.ts` - Redis → Supabase sync

**Features:**
- SSE Streaming for live updates
- JWT Validation and entitlement checks
- Symbol Subscriptions (only subscribe with viewers)
- High/Low Tracking in real-time
- Redis Caching for fast state
- Periodic Persistence (batch writes every 60s)
- Circuit Breaker for rate limits
- Health endpoint for monitoring

**Deployment:**
```bash
cd realtime-pricing-service
npm install
fly launch
fly secrets set POLYGON_API_KEY=xxx
fly deploy
```

### 2.7 Price Update System

**File:** `supabase/functions/indices-price-update-system/`

**Workflow:**
1. Cron job triggers every minute
2. Fetch active index prices from Polygon
3. Update database with current prices
4. Detect if analysis targets hit
5. Generate snapshots if needed
6. Queue Telegram notifications

### 2.8 Performance Characteristics

**Scalability Targets:**
| Metric | Target |
|--------|--------|
| Concurrent SSE connections | 1,000 |
| Active trades per analysis | 100 |
| Quote updates per second | 10 per symbol |
| SSE latency (quote → UI) | <200ms |
| DB writes per minute | 50-100 (batched) |

---

## 3. Subscription & Monetization

### 3.1 Overview

Complete manual subscription system with immediate activation, full testing infrastructure, and architecture ready for future payment providers.

### 3.2 Database Schema

#### Tables

**1. analyzer_plans**
```sql
CREATE TABLE analyzer_plans (
  id UUID PRIMARY KEY,
  analyst_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER,
  billing_interval TEXT, -- 'month' | 'year'
  features JSONB,
  telegram_channel_id TEXT,
  max_subscribers INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**2. subscriptions**
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  subscriber_id UUID REFERENCES profiles(id),
  analyst_id UUID REFERENCES profiles(id),
  plan_id UUID REFERENCES analyzer_plans(id),
  status TEXT, -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'
  start_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  provider TEXT DEFAULT 'manual',
  provider_subscription_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**3. telegram_memberships**
```sql
CREATE TABLE telegram_memberships (
  id UUID PRIMARY KEY,
  subscription_id UUID REFERENCES subscriptions(id),
  channel_id TEXT,
  invite_link TEXT,
  status TEXT, -- 'pending' | 'invited' | 'joined' | 'kicked' | 'revoked'
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**4. analyses visibility**
```sql
ALTER TABLE analyses ADD COLUMN visibility TEXT;
-- 'public' | 'followers' | 'subscribers' | 'private'
```

### 3.3 API Endpoints

#### Subscription Management

**Create Subscription:**
```
POST /api/subscriptions/create
Body: { "planId": "uuid" }
Returns: { subscriptionId, status, periodEnd, inviteLink }
```

**Cancel Subscription:**
```
POST /api/subscriptions/cancel
Body: {
  "subscriptionId": "uuid",
  "mode": "end_of_period" | "immediate"
}
```

**Get My Subscriptions:**
```
GET /api/subscriptions/me
Returns: Active subscriptions with plan details and Telegram invite links
```

**Check Subscription:**
```
GET /api/subscriptions/check?analystId=uuid
Returns: Subscription status and details
```

#### Plan Management

**List Plans:**
```
GET /api/plans?analystId=uuid
Returns: Active plans with subscriber counts
```

**Create Plan:**
```
POST /api/plans
Body: {
  "name": "Pro Plan",
  "price_cents": 0,
  "billing_interval": "month",
  "features": {...},
  "max_subscribers": 100
}
```

### 3.4 Access Control

**Visibility Enforcement:**
- Public: Everyone can view
- Followers: Only followers can view
- Subscribers: Only active subscribers can view
- Private: Owner only

**Helper Function:**
```sql
CREATE FUNCTION has_active_subscription(
  p_subscriber_id UUID,
  p_analyst_id UUID
) RETURNS BOOLEAN;
```

**RLS Policies:**
```sql
-- Subscriber-only content
CREATE POLICY "subscribers_view_content"
  ON analyses FOR SELECT
  USING (
    visibility = 'public' OR
    (visibility = 'subscribers' AND
     has_active_subscription(auth.uid(), author_id))
  );
```

### 3.5 UI Components

**SubscriptionPlans.tsx**
- Display analyst's subscription plans
- Subscribe button with validation
- Subscriber count and limits
- Telegram channel badge

**MySubscriptions.tsx**
- Manage active subscriptions
- Cancel options (immediate/end of period)
- Telegram invite link access
- Renewal date display

**PlanManagement.tsx**
- Analyzer dashboard for managing plans
- Create/edit/delete plans
- Toggle active status
- Subscriber count tracking

### 3.6 Payment Provider Ready

The system is architected for easy payment integration:
- `provider` field defaults to 'manual'
- `provider_subscription_id` for webhook mapping
- Status enum matches common provider states
- Webhook endpoint ready
- Metadata JSONB for provider-specific data

**Future Integration Steps:**
1. Add payment provider SDK (Stripe/PayPal)
2. Create webhook endpoint: `/api/webhooks/[provider]`
3. Update subscription creation to use provider API
4. Map provider events to subscription status
5. Handle refunds and disputes

### 3.7 Telegram Integration

**Channel Verification:**
```
POST /api/telegram/verify-channel
Body: { "channelId": "@channel" }
Returns: Channel info and bot permissions
```

**Automatic Invite Links:**
- Generated on subscription creation
- Single-use links with 24-hour expiry
- Stored in telegram_memberships table

**Subscription Expiration System:**
```sql
CREATE FUNCTION expire_subscriptions() RETURNS VOID;
```
- Runs daily to expire past subscriptions
- Updates subscription status
- Revokes Telegram access
- Queues expiration notifications

---

## 4. Reports & Analytics

### 4.1 Daily PDF Report System

#### Overview
Automated professional trading reports generated at market close (4 PM ET) and distributed to subscriber Telegram channels.

#### Report Content

**Statistics Grid:**
- Total trades
- Active trades
- Closed trades
- Expired trades
- Average profit %
- Maximum profit %
- Win rate %

**Detailed Trade Cards:**
- Symbol and option type (CALL/PUT)
- Strike price
- Entry price and highest price achieved
- Current price
- Max profit percentage
- Trade status and exit reason

#### Report Design

**HTML Structure:**
- Gradient header with branding
- Statistics grid (7 cards)
- Today's trades list with cards
- Footer with branding

**Telegram Message Format:**
```
📊 Daily Trading Report
📅 [Date]

🎯 Performance Summary
━━━━━━━━━━━━━━━━━━━━
📌 Total Trades: X
🔵 Active: X
✅ Closed: X
⏰ Expired: X

📈/📉 Profit Metrics
━━━━━━━━━━━━━━━━━━━━
💰 Avg Profit: +X.X%
🚀 Max Profit: +X.X%
🎯 Win Rate: X.X%

Generated by AnalyZHub
```

#### Implementation

**Edge Function:** `supabase/functions/generate-daily-pdf-report`

**Service:** `services/indices/daily-report-generator.ts`

**Cron Job:**
```sql
SELECT cron.schedule(
  'daily-pdf-report-generator',
  '0 21 * * 1-5',  -- Mon-Fri at 9 PM UTC (4 PM ET)
  $$SELECT net.http_post(...)$$
);
```

**Database Table:**
```sql
CREATE TABLE daily_trade_reports (
  id UUID PRIMARY KEY,
  report_date DATE,
  total_trades INTEGER,
  active_trades INTEGER,
  closed_trades INTEGER,
  expired_trades INTEGER,
  avg_profit_percent NUMERIC,
  max_profit_percent NUMERIC,
  win_rate NUMERIC,
  report_html TEXT,
  created_at TIMESTAMPTZ
);
```

#### Report Formats

- HTML (web viewable)
- PDF (downloadable)
- Image snapshot (shareable)

#### Language Support

- English reports
- Arabic reports
- Dual language (bilingual) reports

#### Delivery Methods

- Telegram channels (automatic)
- Manual generation (on-demand)
- Public report links
- Report archive

### 4.2 Advanced Daily Reports System

**File:** `supabase/functions/advanced-daily-reports-system/`

**Features:**
- Period reports (daily, weekly, monthly)
- Custom date range reports
- Comparative analytics
- Performance trends
- Export capabilities

**Configuration:**
```sql
CREATE TABLE report_configurations (
  id UUID PRIMARY KEY,
  analyst_id UUID,
  report_type TEXT,
  frequency TEXT,
  language TEXT,
  channels TEXT[],
  is_active BOOLEAN
);
```

### 4.3 Report Formatting & PDF System

**Profit Calculation Logic:**
All reports now use high watermark-based profit:
```typescript
profit = (contract_high_since - entry_price) * qty * multiplier
is_winning = profit >= 100
```

**Percentage Formatting:**
```typescript
// lib/format-utils.ts
formatPercent(value: number): string {
  // Values >= 10%: Round to nearest integer (15%)
  // Values >= 1%: Round to 0.1 decimal (5.3%)
  // Values < 1%: Round to 0.01 decimal (0.25%)
}
```

**Applied To:**
- Daily reports summary
- Win rate displays
- P&L percentages
- Performance metrics

### 4.4 Reports Implementation Summary

**Migration:** Applied
- Report generation functions
- Database schema for reports
- Scheduled jobs configured

**Edge Functions:** Deployed
- `generate-daily-pdf-report`
- `advanced-daily-reports-system`

**API Endpoints:**
```
GET /api/indices/daily-reports?date=YYYY-MM-DD
POST /api/indices/reports/generate
GET /api/indices/reports/:id
```

---

## 5. Rankings & Recommendations

### 5.1 Ranking System

#### Overview
Transparent, auditable points and badge system rewarding analysts and traders with anti-gaming protections.

#### Architecture Components

1. **Ledger System** - Immutable log of all point events
2. **Balance Cache** - Fast access to current totals
3. **Badge Engine** - Automated badge awarding
4. **Leaderboards** - Cached rankings (weekly, monthly, all-time)
5. **Anti-Gaming** - Multiple fraud prevention layers

#### Database Schema

**user_points_ledger:**
```sql
CREATE TABLE user_points_ledger (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ,

  UNIQUE (user_id, event_type, reference_type, reference_id)
);
```

**user_points_balance:**
```sql
CREATE TABLE user_points_balance (
  user_id UUID PRIMARY KEY,
  analyst_points_all_time INTEGER DEFAULT 0,
  analyst_points_weekly INTEGER DEFAULT 0,
  analyst_points_monthly INTEGER DEFAULT 0,
  trader_points_all_time INTEGER DEFAULT 0,
  trader_points_weekly INTEGER DEFAULT 0,
  trader_points_monthly INTEGER DEFAULT 0,
  last_updated_at TIMESTAMPTZ
);
```

#### Scoring Rules

**Analyst Points:**
| Event | Points | Requirements |
|-------|--------|-------------|
| Analysis Created | +5 | Valid analysis with targets and stop loss |
| Target Hit | +10 | Per target, system-validated |
| Stop Loss Hit | -10 | System-validated |

**Trader Points:**
| Event | Points | Requirements |
|-------|--------|-------------|
| Like | +1 | Unique per analysis per user |
| Bookmark | +2 | Unique per analysis per user |
| Repost | +3 | Unique per analysis per user |
| Comment | +3 | Quality rules (see below) |
| Rating | +5 | Analysis closed, not own |

**Comment Quality Rules:**
- Minimum 25 characters
- Not repeated (checked against recent hour)
- Not only emojis (max 50% emoji ratio)
- Max 3 links
- At least 5 words

**Daily Caps:**
- Analyst: 10 analyses/day (50 points max from creation)
- Trader: 100 points/day maximum
- Caps reset at midnight UTC

#### Badge System

**Analyst Badges:**
- 🥉 Consistent Analyst (Bronze): 60-69% win rate, 20+ closed
- 🥈 Professional Analyst (Silver): 70-79% win rate, 40+ closed, 3+ targets hit in 30 days
- 🥇 Elite Analyst (Gold): 80-89% win rate, 60+ closed, max 2 consecutive stops
- 💎 Legend (Diamond): 90%+ win rate, 100+ closed, active in 60 days

**Trader Badges:**
- 🥈 Insightful Rater: 50+ ratings, 60%+ accuracy
- 🥉 Market Supporter: 20+ reposts, 10+ successful
- 🥇 Hybrid Trader: 70%+ rating accuracy, 10+ analysts followed, 10+ symbols

#### Anti-Gaming Protections

1. **Account Age**: Minimum 7 days, email verified
2. **Daily Caps**: Trader 100 points/day, Analyst 10 analyses/day
3. **Uniqueness**: Database unique constraints prevent duplicates
4. **Quality Scoring**: Comment content analysis
5. **Rate Limiting**: >20 actions/minute flagged
6. **Immutable Ledger**: All points derived from logged events

#### API Endpoints

```
GET /api/leaderboards?type=analyst|trader&scope=weekly|monthly|all_time
GET /api/rankings/:id
POST /api/ratings/submit
POST /api/scoring/award (internal)
POST /api/scoring/recalculate (internal)
```

#### Integration

**Award Points:**
```typescript
import { scoringService } from '@/services/scoring/scoring.service'

// Analysis creation
await scoringService.awardAnalysisCreationPoints(analystId, analysisId)

// Target hit
await scoringService.awardTargetHitPoints(analystId, analysisId, targetIndex)

// Trader actions
await scoringService.awardLikePoints(traderId, analysisId)
await scoringService.awardCommentPoints(traderId, commentId, content)
```

**Display:**
```tsx
import { ProfileStats } from '@/components/rankings/ProfileStats'
import { LeaderboardView } from '@/components/rankings/LeaderboardView'

<ProfileStats userId={userId} />
<LeaderboardView initialType="analyst" initialScope="all_time" />
```

#### Scheduled Jobs

**Nightly Recalculation (2 AM UTC):**
```bash
curl -X POST https://your-domain.com/api/scoring/recalculate \
  -H "X-API-Key: YOUR_KEY"
```

What it does:
- Recalculates all point balances
- Updates user statistics
- Evaluates badge criteria
- Awards new badges and revokes outdated ones
- Regenerates leaderboard caches
- Cleans up old daily cap records

Duration: ~2-5 minutes for 1000 users

### 5.2 Recommendation System

#### Overview
AI-driven personalization that recommends content based on engagement patterns, following relationships, and analyzer performance.

#### Event Tracking

**Table:** `engagement_events`
```sql
CREATE TABLE engagement_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  entity_type TEXT, -- 'analysis' | 'analyzer' | 'symbol'
  entity_id UUID,
  event_type TEXT, -- 'view' | 'like' | 'bookmark' | 'comment' | 'follow' | 'share'
  metadata JSONB,
  created_at TIMESTAMPTZ
);
```

#### Recommendation Engine

**Feed Recommendations (Analyses):**

**Candidate Generation:**
- Analyses from followed analyzers
- Analyses for followed symbols
- Trending analyses (high engagement in 24h)
- Excludes own analyses and recently viewed

**Scoring Features (Weights):**
- Recency Decay (30%): Prioritizes newer content
  - < 2 hours: 100%
  - < 6 hours: 90%
  - < 24 hours: 70%
  - < 72 hours: 50%
  - < 1 week: 30%
  - Older: 10%
- Symbol Affinity (25%): Engagement with symbols
- Analyzer Affinity (20%): Engagement with analyzers
- Analyzer Quality (15%): Win rate with sample-size adjustment
- Engagement Momentum (10%): Recent popularity
- Follower Relationship (20%): Direct follows

**Analyzer Recommendations:**

**Candidate Generation:**
- Co-follow suggestions (followed by people you follow)
- Top-performing analyzers
- New analyzers

**Scoring Features:**
- Quality metrics (50%): Win rate and sample size
- Co-follow count (30%): Social proof
- Recency bonus (20%): New analyzer boost

**Symbol Recommendations:**

**Candidate Generation:**
- Symbols analyzed by followed analyzers
- Trending symbols (high analysis volume)
- Symbols with growing followers

**Scoring Features:**
- Followed analyzer activity (50%)
- Analysis volume (30%)
- Follower count (20%)

#### Materialized Views

```sql
-- Trending analyses (24h window)
CREATE MATERIALIZED VIEW trending_analyses AS
SELECT analysis_id, COUNT(*) as engagement_count
FROM engagement_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY analysis_id;

-- User symbol affinity (30d window)
CREATE MATERIALIZED VIEW user_symbol_affinity AS
SELECT user_id, symbol, COUNT(*) as interaction_count
FROM engagement_events
WHERE entity_type = 'symbol'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id, symbol;
```

**Refresh Strategy:** Hourly via cron

#### API Endpoints

```
POST /api/events
GET /api/recommendations/feed?limit=20&offset=0
GET /api/recommendations/analyzers?limit=10&offset=0
GET /api/recommendations/symbols?limit=10&offset=0
```

#### Transparency

Each recommendation includes explicit reasons:
- "You follow [analyzer]"
- "You follow $[symbol]"
- "Trending today"
- "High win-rate analyzer"
- "Just posted"
- "Followed by [N] analysts you follow"

---

## 6. Internationalization

### 6.1 Overview

Complete bilingual support (English/Arabic) across all platform pages with RTL layout support.

### 6.2 Translation System

**Language Context:** `lib/i18n/language-context.tsx`

```typescript
export const useLanguage = () => {
  const { language, setLanguage } = useContext(LanguageContext)
  const t = translations[language]
  return { language, setLanguage, t }
}
```

**Translation Files:**
- `lib/i18n/translations/en.ts` - English translations
- `lib/i18n/translations/ar.ts` - Arabic translations

### 6.3 Implementation Pattern

```typescript
import { useLanguage } from '@/lib/i18n/language-context'

export default function Page() {
  const { t } = useLanguage()

  return (
    <div>
      <h1>{t.section.title}</h1>
      <p>{t.section.description}</p>
    </div>
  )
}
```

### 6.4 Fully Translated Pages

**Core Pages:**
- Subscriber Management (`/dashboard/subscribers`)
- Financial Dashboard (`/dashboard/financial`)
- Subscription Marketplace (`/dashboard/subscriptions`)
- Indices Hub (`/dashboard/indices`)

**Features:**
- Instant language switching
- RTL layout for Arabic
- Consistent translation keys
- Professional quality translations

### 6.5 Arabic Language Support

**File:** `ARABIC_LANGUAGE_SUPPORT.md`

**Features:**
- Full RTL (Right-to-Left) layout
- Arabic translations for all UI elements
- Arabic Telegram messages
- Arabic PDF reports
- Date/time formatting in Arabic

**Arabic Message Improvements:**
- Explicit strike label: "سترايك: [value]"
- Clear contract details
- Professional formatting with emojis

**Message Format:**
```
العقد: SPX
سترايك: 6950
الاتجاه: شراء
الدخول: 3.50
الأعلى: 7.00
```

### 6.6 Translation Keys Structure

**Common Sections:**
```typescript
t.common.loading
t.common.save
t.common.cancel
t.common.delete
t.common.edit
```

**Financial Dashboard:**
```typescript
t.financialDashboard.title
t.financialDashboard.totalEarnings
t.financialDashboard.subscribers
t.financialDashboard.pendingPayout
```

**Indices Hub:**
```typescript
t.indicesHub.title
t.indicesHub.createAnalysis
t.indicesHub.myAnalyses
t.indicesHub.liveMonitor
```

### 6.7 Benefits

1. Full bilingual support
2. Instant language switching
3. Centralized translation management
4. Easy maintenance
5. Professional quality
6. RTL support

---

## 7. Analysis & Content Management

### 7.1 Activation Conditions System

#### Overview
Deferred activation system where analyses can be published but remain inactive until specific price-based conditions are met.

#### Features

**Activation Types:**
- Price above threshold
- Price below threshold
- Price between range
- Volume conditions
- Time-based activation

**Activation Status:**
- Draft (not published)
- Published but inactive (waiting for trigger)
- Active (condition met)
- Expired (time window passed)

#### Database Schema

```sql
ALTER TABLE analyses ADD COLUMN:
  activation_condition JSONB,
  activation_status TEXT,
  activated_at TIMESTAMPTZ
```

**Example Condition:**
```json
{
  "type": "price_above",
  "threshold": 150.00,
  "timeWindow": {
    "start": "2026-01-15T09:30:00Z",
    "end": "2026-01-15T16:00:00Z"
  }
}
```

#### Checker Service

**File:** `supabase/functions/activation-conditions-checker/`

**Logic:**
1. Fetch all published but inactive analyses
2. Check current prices against conditions
3. Activate if condition met
4. Send notifications to followers/subscribers
5. Mark as expired if time window passed

**Cron Schedule:** Every 5 minutes

#### UI Component

**File:** `components/analysis/ActivationConditionsUI.tsx`

**Features:**
- Visual condition builder
- Condition type selector
- Threshold input
- Time window picker
- Preview of activation logic

### 7.2 Create Analysis Fixes

**File:** `CREATE_ANALYSIS_FIXES_COMPLETE.md`

**Fixes Applied:**
- Validation improvements
- Chart upload enhancements
- Target/stop loss validation
- Symbol search optimization
- Form state management
- Error handling improvements

**Features:**
- Multiple chart attachments
- Drag-and-drop upload
- Image preview
- Automatic optimization
- Chart annotation support

### 7.3 Resend Analysis Feature

**File:** `RESEND_ANALYSIS_FEATURE_SUMMARY.md`

#### Overview
Allows analysts to resend previously published analyses to Telegram channels.

**Features:**
- Resend to specific channels
- Select multiple channels
- Custom message text (optional)
- Scheduled resends
- Resend history tracking

**API Endpoint:**
```
POST /api/analyses/:id/resend
Body: {
  "channelIds": ["@channel1", "-100123456"],
  "customMessage": "Updated analysis",
  "scheduledAt": "2026-02-10T10:00:00Z"
}
```

**Component:** `components/analysis/ResendAnalysisDialog.tsx`

**Telegram Integration:**
```typescript
// Edge function: resend-analysis-to-telegram
Deno.serve(async (req) => {
  const { analysisId, channelIds, customMessage } = await req.json()

  // Fetch analysis
  // Format message
  // Send to each channel
  // Track delivery
})
```

---

## 8. Media & Image Generation

### 8.1 Internal Image Generation System

**File:** `INTERNAL_IMAGE_GENERATION_COMPLETE.md`

#### Overview
Complete image generation system for trade snapshots using ApiFlash for HTML to image conversion.

#### Architecture

**Edge Function:** `supabase/functions/generate-trade-snapshot/`

**Flow:**
1. Receive snapshot request (trade ID)
2. Fetch trade details from database
3. Generate HTML template with trade data
4. Call ApiFlash API to convert HTML to PNG
5. Upload image to Supabase Storage
6. Save image URL to trade record
7. Return image URL

#### HTML Template

**Design:**
- Robinhood-inspired style
- Large price display (140px font)
- Color-coded (green/red)
- Contract details (strike, expiry, type)
- Underlying price with change
- "NEW HIGH" badge (conditional)

**Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, sans-serif; }
    .current-price { font-size: 140px; color: ${priceColor}; }
    .badge { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
  </style>
</head>
<body>
  <div class="container">
    <div class="current-price">${currentPrice}</div>
    <div class="details">...</div>
  </div>
</body>
</html>
```

#### ApiFlash Integration

**Service:** `services/snapshot/apiflash.service.ts`

```typescript
async function generateSnapshot(html: string): Promise<Buffer> {
  const response = await fetch('https://api.apiflash.com/v1/urltoimage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: process.env.APIFLASH_KEY,
      url: `data:text/html,${encodeURIComponent(html)}`,
      format: 'png',
      width: 1280,
      height: 720,
      quality: 95
    })
  })

  return await response.buffer()
}
```

#### Storage

**Bucket:** `chart-images`

**Path Structure:**
```
/snapshots/
  /trades/
    /{trade_id}/
      /entry.png
      /high_{timestamp}.png
      /target_{level}.png
      /final.png
```

**URL Format:**
```
https://your-project.supabase.co/storage/v1/object/public/chart-images/snapshots/trades/{trade_id}/high_1704470400.png
```

#### Database Integration

```sql
ALTER TABLE index_trades ADD COLUMN:
  contract_url TEXT,        -- Latest snapshot URL
  snapshot_history JSONB    -- Array of all snapshots
```

### 8.2 Snapshot Generation Fix

**File:** `SNAPSHOT_GENERATION_FIX.md`

**Issues Fixed:**
- Image generation missing in manual trade creation
- Enhanced logging for debugging
- Fixed image URL storage to `contract_url` field
- Works on both localhost and production

**Root Cause:** Image generation was missing in manual trade API

**Fixes Applied:**
- Added snapshot generation to manual trade API
- Enhanced error handling
- Fixed image URL storage
- Added retry logic for failed generations

**Telegram Integration:**
```typescript
// Attach image to Telegram message
const message = {
  text: messageText,
  photo: contractUrl,  // Snapshot URL
  parse_mode: 'HTML'
}
```

---

## 9. Financial Management

### 9.1 Overview

Modular financial management and subscriber management system with zero impact on existing platform logic.

### 9.2 System Architecture

**Key Principles:**
- Zero Impact: Isolated module with event-based integration
- Ledger-First: All financial operations recorded in immutable ledger
- Role-Based Access: Granular permissions for Admin, Analyst, End User
- Payment Agnostic: Compatible with any payment gateway
- Audit Trail: Complete history of all financial operations

### 9.3 Core Tables

#### financial_transactions

```sql
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY,
  transaction_type TEXT NOT NULL, -- 'subscription_payment' | 'subscription_renewal' | 'refund' | 'chargeback' | 'adjustment'
  subscription_id UUID REFERENCES subscriptions(id),
  analyst_id UUID NOT NULL,
  subscriber_id UUID NOT NULL,
  plan_id UUID,

  -- Financial Details
  gross_amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  platform_fee_cents INTEGER NOT NULL,
  platform_fee_type TEXT,
  platform_fee_rate NUMERIC(5,2),
  net_amount_cents INTEGER NOT NULL,

  -- Payment Provider
  provider TEXT DEFAULT 'manual',
  provider_transaction_id TEXT,
  provider_fee_cents INTEGER,
  provider_metadata JSONB,

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending' | 'completed' | 'failed' | 'reversed' | 'disputed'
  transaction_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,

  CONSTRAINT valid_net_amount CHECK (
    net_amount_cents = gross_amount_cents - platform_fee_cents - COALESCE(provider_fee_cents, 0)
  )
);
```

#### platform_fee_rules

```sql
CREATE TABLE platform_fee_rules (
  id UUID PRIMARY KEY,
  analyst_id UUID,  -- If analyst-specific
  plan_id UUID,     -- If plan-specific
  rule_type TEXT,   -- 'analyst' | 'plan' | 'global'

  -- Fee Configuration
  fee_type TEXT,    -- 'percentage' | 'fixed'
  fee_value NUMERIC(10,2),
  priority INTEGER DEFAULT 0,

  -- Validity
  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ,
  effective_until TIMESTAMPTZ,

  -- Audit
  created_by UUID,
  change_reason TEXT,
  created_at TIMESTAMPTZ
);
```

#### analyst_earnings_summary

```sql
CREATE TABLE analyst_earnings_summary (
  analyst_id UUID PRIMARY KEY,

  -- All-Time
  total_gross_cents BIGINT DEFAULT 0,
  total_platform_fee_cents BIGINT DEFAULT 0,
  total_net_cents BIGINT DEFAULT 0,

  -- Current Month
  month_gross_cents BIGINT DEFAULT 0,
  month_net_cents BIGINT DEFAULT 0,

  -- Current Year
  year_gross_cents BIGINT DEFAULT 0,
  year_net_cents BIGINT DEFAULT 0,

  -- Subscribers
  total_subscribers_all_time INTEGER DEFAULT 0,
  active_subscribers_count INTEGER DEFAULT 0,

  -- Payout
  total_paid_out_cents BIGINT DEFAULT 0,
  pending_payout_cents BIGINT DEFAULT 0,

  last_calculated_at TIMESTAMPTZ
);
```

### 9.4 API Structure

#### Analyst APIs

```
GET /api/financial/analyst/dashboard
GET /api/financial/analyst/subscribers?status=active&page=1
GET /api/financial/analyst/history?startDate=2026-01-01
GET /api/financial/analyst/earnings-by-plan
GET /api/financial/analyst/earnings-by-date?period=month
GET /api/financial/analyst/payout-history
```

#### Admin APIs

```
GET /api/admin/financial/overview
POST /api/admin/financial/fee-rules
GET /api/admin/financial/fee-rules
PUT /api/admin/financial/fee-rules/:id
DELETE /api/admin/financial/fee-rules/:id
GET /api/admin/financial/analysts
POST /api/admin/financial/payouts/create
POST /api/admin/financial/payouts/:id/complete
GET /api/admin/financial/audit-log
POST /api/admin/financial/transactions/adjust
```

### 9.5 Fee Calculation

**Function:**
```sql
CREATE FUNCTION calculate_platform_fee(
  p_analyst_id UUID,
  p_plan_id UUID,
  p_gross_amount_cents INTEGER
) RETURNS TABLE (
  fee_cents INTEGER,
  fee_type TEXT,
  fee_rate NUMERIC
);
```

**Priority:**
1. Plan-specific rule (highest priority)
2. Analyst-specific rule
3. Global rule (fallback, default 20%)

### 9.6 Integration

**Event-Based:**
```
Subscription Created → Transaction Recorded → Earnings Updated
Subscription Renewed → Transaction Recorded → Earnings Updated
Refund Processed → Reversal Transaction → Earnings Adjusted
```

**Async Processing:**
1. Transaction Recording: Immediate
2. Summary Updates: Queued (within seconds)
3. Analytics Recalculation: Batch (hourly/daily)
4. Payout Generation: Scheduled (monthly)

### 9.7 Security

**RLS Policies:**
- Analysts view only their own financial data
- Admins view all financial data
- End users cannot access financial management
- Service role for automated updates

**Audit Trail:**
- All changes logged in `financial_audit_log`
- Who, what, when, why, from where

**PCI Compliance:**
- Never store card numbers or CVV
- All financial data encrypted at rest
- Access logs for all financial data

---

## 10. Platform Core Features

### 10.1 Platform Features Overview

**File:** `PLATFORM_FEATURES_GUIDE.md`

Comprehensive overview of all features by user role:
- Free Trader entitlements
- Subscribed Trader entitlements
- Free Analyzer entitlements
- Premium Analyzer entitlements
- SuperAdmin entitlements

**Core Feature Categories:**
1. Authentication & Account Management
2. Social Features (Follow, Like, Save, Repost, Comment, Rating)
3. Discovery & Search
4. Notifications & Alerts
5. Rankings & Leaderboards
6. Content Creation (Analyses, Trades)
7. Monetization (Plans, Subscriptions)
8. Financial Management
9. Report Generation
10. Telegram Integration
11. Analytics & Statistics

### 10.2 Platform Default Channel Fallback

**File:** `PLATFORM_DEFAULT_CHANNEL_FALLBACK.md`

**Feature:** If analyzer doesn't have a personal Telegram channel configured, system falls back to platform default channel.

**Configuration:**
```sql
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB
);

INSERT INTO platform_settings VALUES
('default_telegram_channel', '{"channelId": "@analyzinghub", "language": "dual"}');
```

**Logic:**
```typescript
// Get analyzer channel or fallback
const channel = analyzerChannel || await getPlatformDefaultChannel()
```

### 10.3 Mobile Optimization

**File:** `MOBILE_OPTIMIZATION.md`

**Features:**
- Responsive design for all screen sizes
- Touch-friendly UI elements
- Mobile navigation optimizations
- Image optimization for mobile
- Fast loading on mobile networks

**Progressive Web App (PWA):**
- Installable to home screen
- Offline capability (limited)
- Push notifications
- App-like experience

**Optimizations:**
- Lazy loading images
- Code splitting
- Bundle size optimization
- Service worker caching
- Touch gesture support

### 10.4 Week 3 & Week 4 Features

**Files:** `WEEK3_FEATURES.md`, `WEEK4_IMPLEMENTATION.md`

**Week 3 Highlights:**
- Enhanced analysis creation
- Real-time price tracking improvements
- Telegram notification enhancements
- UI/UX improvements

**Week 4 Highlights:**
- Subscription system launch
- Financial dashboard
- Report generation automation
- Advanced trading features

### 10.5 Dashboard Enhancements

**File:** `DASHBOARD_ENHANCEMENTS_SUMMARY.md`

**Enhancements:**
- Performance metrics cards
- Quick actions panel
- Recent activity feed
- Personalized recommendations
- Analytics widgets
- Responsive grid layout

**Statistics Displayed:**
- Total analyses
- Active positions
- Success rate
- Followers/Following counts
- Recent activity
- Earnings (for analyzers)

### 10.6 Implementation Summary

**File:** `IMPLEMENTATION_SUMMARY_DEC_31.md`

**Major Milestones:**
- Complete trading system implementation
- Subscription and monetization system
- Report generation automation
- Telegram integration
- Multilingual support
- Financial management system
- Rankings and recommendations
- Mobile optimization

**Status:** All core features implemented and deployed

---

## Appendix A: Testing Procedures

### Unit Testing

**Trading System:**
```bash
npm run test:canonical-trade-system
npm run test:trade-reentry-system
```

**Target System:**
```bash
npm run test:target-success
```

**Subscription System:**
```bash
npm run test:subscription-flow
```

### Integration Testing

**End-to-End Flows:**
1. User registration → Subscription → Access content
2. Create analysis → Publish → Target hit → Notification
3. Create trade → Price update → New high → Snapshot → Telegram
4. Subscription payment → Transaction → Earnings → Report

### Manual Testing Checklist

**Trading Features:**
- [ ] Manual trade entry works
- [ ] High watermark updates correctly
- [ ] Canonical finalization calculates properly
- [ ] Re-entry prompts appear
- [ ] Average adjustment calculates correctly

**Subscription Features:**
- [ ] Plan creation works
- [ ] Subscription process completes
- [ ] Access control enforced
- [ ] Telegram invite generated
- [ ] Cancellation works

**Report Features:**
- [ ] Daily reports generate
- [ ] Reports sent to Telegram
- [ ] PDF generation works
- [ ] Multiple languages supported

**Telegram Features:**
- [ ] Account linking works
- [ ] Notifications delivered
- [ ] Channel management works
- [ ] Arabic messages formatted correctly

---

## Appendix B: Common Issues & Solutions

### Issue: Snapshots Not Generating

**Symptoms:** Trade snapshots not appearing

**Solutions:**
1. Check ApiFlash API key is set
2. Verify `generate-trade-snapshot` function deployed
3. Check Supabase Storage bucket exists
4. Review function logs in Supabase dashboard

**Debug Query:**
```sql
SELECT * FROM index_trades
WHERE contract_url IS NULL
AND created_at > NOW() - INTERVAL '1 day';
```

### Issue: Telegram Not Sending

**Symptoms:** Notifications not reaching Telegram

**Solutions:**
1. Verify channel is connected
2. Check Telegram bot token valid
3. Confirm `indices-telegram-publisher` running
4. Check `telegram_sent` column in updates table

**Debug Query:**
```sql
SELECT * FROM telegram_outbox
WHERE sent_at IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Issue: Canonical Calculations Wrong

**Symptoms:** Profit calculations don't match expected

**Solutions:**
1. Check high watermark is updating
2. Verify multiplier is 100 for options
3. Ensure finalization function is called
4. Check `counted_in_stats` flag

**Debug Query:**
```sql
SELECT id, entry_cost_usd, max_contract_price, max_profit, is_win, pnl_usd
FROM index_trades
WHERE id = 'trade-id';

-- Manually finalize
SELECT finalize_trade_canonical('trade-id');
```

### Issue: Subscriptions Not Working

**Symptoms:** Access not granted after subscription

**Solutions:**
1. Check subscription status is 'active'
2. Verify RLS policies enabled
3. Check `has_active_subscription` function
4. Clear cache and refresh

**Debug Query:**
```sql
SELECT * FROM subscriptions
WHERE subscriber_id = 'user-id'
AND status = 'active';

-- Test function
SELECT has_active_subscription('subscriber-id', 'analyst-id');
```

---

## Appendix C: Configuration Reference

### Environment Variables

**Required:**
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POLYGON_API_KEY=
APIFLASH_KEY=
TELEGRAM_BOT_TOKEN=
```

**Optional:**
```env
REALTIME_SERVICE_URL=
REDIS_URL=
INTERNAL_API_KEY=
NEXT_PUBLIC_APP_URL=
```

### Feature Flags

**Enable/Disable Features:**
```sql
CREATE TABLE feature_flags (
  feature_name TEXT PRIMARY KEY,
  is_enabled BOOLEAN DEFAULT true,
  enabled_for_roles TEXT[],
  metadata JSONB
);

INSERT INTO feature_flags VALUES
('manual_trades', true, ARRAY['Analyzer', 'SuperAdmin'], '{}'),
('subscription_system', true, ARRAY['Analyzer', 'Trader'], '{}'),
('financial_dashboard', true, ARRAY['Analyzer', 'SuperAdmin'], '{}');
```

### Database Indexes

**Critical Indexes:**
```sql
CREATE INDEX idx_trades_author_status ON index_trades(author_id, status);
CREATE INDEX idx_trades_active ON index_trades(status) WHERE status = 'active';
CREATE INDEX idx_subscriptions_active ON subscriptions(subscriber_id, status) WHERE status = 'active';
CREATE INDEX idx_transactions_analyst_date ON financial_transactions(analyst_id, transaction_date);
CREATE INDEX idx_engagement_user_date ON engagement_events(user_id, created_at);
```

---

## Appendix D: Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Edge functions deployed
- [ ] Cron jobs configured
- [ ] Feature flags reviewed

### Deployment Steps

1. **Database:**
   ```bash
   npx supabase migration up
   npx supabase db push
   ```

2. **Edge Functions:**
   ```bash
   npx supabase functions deploy indices-trade-tracker
   npx supabase functions deploy indices-telegram-publisher
   npx supabase functions deploy generate-trade-snapshot
   npx supabase functions deploy generate-daily-pdf-report
   ```

3. **Realtime Service:**
   ```bash
   cd realtime-pricing-service
   fly deploy
   ```

4. **Frontend:**
   ```bash
   npm run build
   netlify deploy --prod
   ```

### Post-Deployment

- [ ] Smoke tests completed
- [ ] Monitor error logs
- [ ] Check cron job execution
- [ ] Verify Telegram integration
- [ ] Test user flows
- [ ] Monitor performance metrics

---

## Conclusion

This comprehensive guide consolidates all implemented features across the AnalyZHub platform. The system is production-ready with:

✅ Complete trading system with canonical calculations
✅ Subscription and monetization platform
✅ Automated reporting and analytics
✅ Full Telegram integration
✅ Multilingual support (EN/AR)
✅ Financial management system
✅ Rankings and recommendations
✅ Mobile optimization
✅ Comprehensive testing coverage
✅ Full documentation

**For the latest updates and additional documentation, refer to the individual feature files referenced throughout this guide.**

---

**Document Version:** 2.0
**Last Updated:** February 7, 2026
**Maintained By:** Development Team
**Status:** ✅ Complete and Current
