# System Architecture Documentation

**AnalyzingHub - Complete Architecture Guide**

Last Updated: January 2025

---

## Table of Contents

1. [Executive Overview](#executive-overview)
2. [Platform Structure](#platform-structure)
3. [Technology Stack](#technology-stack)
4. [Architecture Layers](#architecture-layers)
5. [Database Architecture](#database-architecture)
6. [Real-time Systems](#real-time-systems)
7. [Indices Hub Architecture](#indices-hub-architecture)
8. [Workflow Systems](#workflow-systems)
9. [Ranking & Recommendation Systems](#ranking--recommendation-systems)
10. [Subscription System](#subscription-system)
11. [Financial Management System](#financial-management-system)
12. [Performance & Scalability](#performance--scalability)
13. [Security Architecture](#security-architecture)
14. [Monitoring & Observability](#monitoring--observability)

---

## Executive Overview

AnalyzingHub is a social platform for market analysts and traders that automatically validates trading analysis results. The platform combines social networking features with real-time market data integration, automated performance tracking, and comprehensive financial management.

### Core Platform Features

- Auto-validated trading analysis with success rate tracking
- Real-time price tracking for stocks and options contracts
- Social features (follow, like, comment, repost)
- Subscription plans for analyzers
- Telegram integration for notifications and channel broadcasting
- Leaderboards and rankings
- Multi-language support (English & Arabic)
- Indices options trading hub with live price streaming

### Platform Mission

Enable analysts to showcase their expertise through transparent, auto-validated predictions while providing traders with reliable, data-driven insights from top-performing analysts.

---

## Platform Structure

### Technology Stack

#### Frontend
- **Framework**: Next.js 13.5+ (App Router)
- **Language**: TypeScript 5.2
- **Styling**: Tailwind CSS 3.3
- **UI Components**: shadcn/ui (Radix UI)
- **Icons**: Lucide React
- **State Management**: React Context + Hooks
- **Real-time**: Server-Sent Events (SSE)

#### Backend
- **API**: Next.js API Routes (Server-side)
- **Runtime**: Node.js 18+
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth (JWT-based)
- **Edge Functions**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage

#### External Services
- **Market Data**: Polygon.io API, Databento Live API
- **Messaging**: Telegram Bot API
- **Email**: Supabase Email (SMTP)
- **Screenshots**: Screenshot API
- **Caching**: Redis (Upstash)

#### Infrastructure
- **Hosting**: Netlify (Frontend + API Routes)
- **Edge Functions**: Supabase
- **Real-time Service**: Fly.io / Railway
- **Database**: Supabase (PostgreSQL)
- **File Storage**: Supabase Storage
- **CDN**: Netlify Edge Network

---

## Architecture Layers

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATIONS                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web App    │  │  Telegram    │  │   Mobile     │          │
│  │  (Next.js)   │  │     Bot      │  │  (Future)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          │ HTTPS/SSE        │ Webhooks         │ REST API
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼──────────────────┐
│               APPLICATION LAYER (Netlify)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                Next.js Application                          │  │
│  │  ├─ API Routes (REST)                                       │  │
│  │  ├─ Server Components (SSR)                                 │  │
│  │  ├─ Client Components                                       │  │
│  │  └─ Middleware (Auth, RLS)                                  │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬───────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐    ┌─────────▼────────┐    ┌───────▼────────┐
│  Supabase Edge │    │   Real-time      │    │   External     │
│   Functions    │    │   Pricing        │    │   Services     │
│                │    │   Service        │    │                │
│ • price-validator   │ (Fly.io)         │    │ • Polygon.io   │
│ • telegram-sender   │                  │    │ • Databento    │
│ • snapshot-gen      │ • WebSocket      │    │ • Telegram API │
└─────────┬──────┘    │ • SSE Streaming  │    └────────────────┘
          │           │ • Redis Cache    │
          │           └──────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────────┐
│                    DATA LAYER (Supabase)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PostgreSQL  │  │   Storage    │  │  Real-time   │         │
│  │   Database   │  │   Buckets    │  │  Channels    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### 1. Presentation Layer (`/app`, `/components`)
- Handles UI rendering and user interactions
- Server Components by default for performance
- Client Components only when needed ('use client' directive)
- No direct database access
- Consumes services for business logic
- Responsive design with Tailwind CSS

#### 2. Business Logic Layer (`/services`)
- Encapsulates business rules
- Data transformation and validation
- Reusable across different UI components
- Service layer pattern implementation
- Handles complex operations

Key Services:
- `auth.service.ts` - Authentication operations
- `user.service.ts` - User management
- `scoring.service.ts` - Points and rankings
- `recommendation.service.ts` - Content recommendations
- `price.service.ts` - Market data fetching
- `telegram.service.ts` - Messaging operations

#### 3. Data Access Layer (`/lib/supabase`)
- Manages database connections
- Provides typed database clients
- Handles authentication state
- Row Level Security enforcement
- Query optimization

#### 4. Security Layer (`middleware.ts`, `/lib/auth`)
- Route protection
- Role-based access control (RBAC)
- Session validation
- JWT verification
- Input sanitization

---

## Database Architecture

### Schema Design Philosophy

- **Normalized Structure**: Minimize data redundancy
- **RLS First**: Row Level Security on all tables
- **Type Safety**: PostgreSQL types exported to TypeScript
- **Audit Trail**: Immutable logs for critical operations
- **Soft Deletes**: Preserve data integrity

### Core Tables Structure

```
┌────────────────────────────────────────────────────────────────┐
│                         Core Tables                             │
└────────────────────────────────────────────────────────────────┘

auth.users (Supabase Auth)
    ↓ (1:1)
profiles
    ↓ (N:1)
roles

profiles ←→ profiles (M:N via follows)

analyses ←→ profiles (1:N)
    ↓
analysis_validations
price_snapshots
analysis_updates

symbols ←→ analyses (1:N)

analyzer_plans ←→ subscriptions (1:N)
    ↓
telegram_memberships
```

### Key Tables Overview

#### User & Profile Management
- **profiles**: User profile information, links to auth.users
- **roles**: User roles (SuperAdmin, Analyzer, Trader)
- **follows**: User follow relationships
- **user_stats**: Cached performance metrics

#### Content & Analysis
- **analyses**: Trading analyses/predictions
- **symbols**: Trading symbols (stocks, crypto, indices)
- **price_snapshots**: Historical price data for validation
- **analysis_validations**: Validation results
- **analysis_updates**: Updates to analyses

#### Social Features
- **likes**: Analysis likes
- **comments**: Comments on analyses (with reply support)
- **reposts**: Analysis reposts
- **saves**: Bookmarked analyses
- **notifications**: User notifications
- **engagement_events**: Analytics tracking

#### Indices Hub (Options/Futures)
- **indices_reference**: Index master data (SPX, NDX, DJI)
- **index_analyses**: Index analysis posts
- **index_trades**: Options/futures trade recommendations
- **trade_updates**: Updates on trades
- **telegram_send_log**: Audit log for Telegram messages

#### Subscription & Monetization
- **analyzer_plans**: Subscription plans by analyzers
- **subscriptions**: User subscriptions to plans
- **telegram_memberships**: Channel access for subscribers
- **financial_transactions**: Immutable financial ledger
- **platform_fee_rules**: Revenue split configuration
- **payouts**: Analyst payout tracking

#### Ranking & Gamification
- **user_points_ledger**: Immutable points log
- **user_points_balance**: Cached point totals
- **user_badges**: Achievement badges
- **leaderboard_cache**: Pre-computed rankings
- **analyzer_ratings**: User ratings of analyzers
- **analyzer_stats**: Cached analyzer metrics

#### Integration & Communication
- **telegram_users**: Telegram account connections
- **analyzer_telegram_channels**: Channel broadcasting config
- **telegram_outbox**: Message queue for Telegram
- **otp_codes**: One-time passwords for auth
- **admin_settings**: Platform configuration

### Row Level Security (RLS)

All tables have RLS enabled with comprehensive policies:

**Public Access:**
- Read public analyses, rankings, profiles
- View active subscription plans

**Authenticated Users:**
- Read their own data
- Read followed users' content based on visibility
- Write own comments, likes, saves
- Subscribe to plans

**Analyzer Role:**
- CRUD their own analyses
- Manage their subscription plans
- View their subscribers
- Configure Telegram channels

**Admin Role:**
- Read all data (auditing)
- Manage platform settings
- Moderate content
- Manage fee rules

**Service Role:**
- Update prices and validations
- Process payments
- Send notifications
- Batch operations

### Database Indexes

Critical indexes for performance:

```sql
-- User lookups
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role_id ON profiles(role_id);

-- Analysis queries
CREATE INDEX idx_analyses_author ON analyses(author_id, created_at DESC);
CREATE INDEX idx_analyses_symbol ON analyses(symbol_id, status);
CREATE INDEX idx_analyses_visibility ON analyses(visibility, status);

-- Social features
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_likes_analysis ON likes(analysis_id);
CREATE INDEX idx_comments_analysis ON comments(analysis_id, created_at);

-- Subscriptions
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id, status);
CREATE INDEX idx_subscriptions_analyst ON subscriptions(analyst_id, status);

-- Points & Rankings
CREATE INDEX idx_points_ledger ON user_points_ledger(user_id, event_type, created_at);
CREATE INDEX idx_leaderboard_cache ON leaderboard_cache(scope, type, rank);

-- Indices trades
CREATE INDEX idx_index_trades_active ON index_trades(status, last_quote_at)
  WHERE status = 'active';
```

---

## Real-time Systems

### Real-time Architecture Overview

AnalyzingHub implements a sophisticated multi-layer real-time system:

1. **Database Real-time** (Supabase Realtime): Instant UI updates
2. **Live Price Streaming** (Databento/Polygon): Market data
3. **Server-Sent Events** (SSE): Price broadcasts to clients
4. **Scheduled Jobs** (pg_cron): Periodic validations

### Real-time Price Update System

#### System Components

```
┌────────────────────────────────────────────────────────────────┐
│                    Market Data Flow                             │
└────────────────────────────────────────────────────────────────┘

OPRA Feed / Polygon API
    │
    │ WebSocket / REST
    ▼
Databento Gateway (Multi-region)
    │
    │ WebSocket Stream (<200ms)
    ▼
┌─────────────────────────────────────────┐
│  databento-live-service (Python/Node)   │
│  - Quote processing                     │
│  - Price change detection (>0.1%)       │
│  - Target/Stop monitoring               │
│  - Redis caching                        │
└───────────────┬─────────────────────────┘
                │
                ├─► Redis (Upstash)
                │   - Live quotes cache
                │   - High/low tracking
                │   - Sub-ms access
                │
                ├─► Database (every 10s)
                │   - Persist prices
                │   - Update highs/lows
                │
                └─► SSE Broadcast
                    - Stream to clients
                    - <100ms latency
```

#### Data Flow Timeline

**User Creates Trade:**
```
T+0ms:   User submits trade form
T+50ms:  API creates index_trade record
T+100ms: Database insert complete
T+150ms: Live service detects new trade
T+200ms: Service subscribes to symbol
T+250ms: Subscription confirmed
T+300ms: First quote received
T+350ms: Database updated
T+400ms: Frontend receives update
T+450ms: UI displays live price

Total: <500ms to live updates
```

**Price Update Cycle:**
```
Market Event:
T+0ms:   Exchange publishes quote
T+50ms:  Databento receives quote
T+100ms: Quote sent to clients
T+150ms: Service processes quote
T+200ms: >0.1% change detected
T+250ms: Redis updated
T+300ms: Database UPDATE (if 10s elapsed)
T+350ms: Realtime channel broadcasts
T+400ms: Frontend receives update
T+450ms: UI re-renders

End-to-end: <500ms
```

**Target/Stop Detection:**
```
Quote Received:
T+0ms:   New contract price
T+10ms:  Load trade data
T+20ms:  Compare with target
T+30ms:  Target hit detected!
T+40ms:  Status → 'tp_hit'
T+50ms:  Create trade_update
T+60ms:  Trigger Telegram alert
T+70ms:  Database commit
T+80ms:  Frontend realtime update
T+90ms:  UI shows notification
T+500ms: Telegram message sent

Notification: <100ms (UI), <600ms (Telegram)
```

### Real-time Database Updates

#### Update Frequencies

| Component | Frequency | Purpose |
|-----------|-----------|---------|
| Polygon Fetch | 5 seconds | Get live market data |
| Database Persist | 10 seconds | Save to Supabase |
| SSE Broadcast | Instant | Stream to frontend |
| Cron Job | 1 minute | Alerts & status checks |
| Snapshot Generation | On-demand | Images for Telegram |

#### Performance Metrics

**Latency (Production):**

| Metric | Target | Actual | P95 | P99 |
|--------|--------|--------|-----|-----|
| Market → Service | <200ms | 150ms | 200ms | 300ms |
| Service → Database | <100ms | 50ms | 80ms | 120ms |
| Database → Frontend | <100ms | 40ms | 60ms | 100ms |
| **End-to-end** | <500ms | 240ms | 340ms | 520ms |

**Throughput:**
- Quotes processed/sec: 10-50
- Database updates/sec: 1-10
- Active subscriptions: 10-20
- Concurrent trades: 5-15

**Resource Usage:**

| Resource | Idle | Active | Peak |
|----------|------|--------|------|
| CPU | 2% | 5% | 15% |
| Memory | 40 MB | 60 MB | 100 MB |
| Network (down) | 5 KB/s | 10 KB/s | 25 KB/s |
| Network (up) | 0.1 KB/s | 0.5 KB/s | 2 KB/s |

### Supabase Realtime Subscriptions

Frontend components subscribe to database changes:

```typescript
// Subscribe to trade updates
const subscription = supabase
  .channel('trade-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'index_trades',
      filter: `status=eq.active`
    },
    (payload) => {
      // Update UI instantly
      updateTradeInList(payload.new);
    }
  )
  .subscribe();

// Subscribe to analysis updates
supabase
  .channel('analysis-updates')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'analysis_updates'
    },
    (payload) => {
      // Add update to feed
      addUpdateToFeed(payload.new);
    }
  )
  .subscribe();
```

---

## Indices Hub Architecture

### Overview

The Indices Hub enables analysts to publish index chart analyses (SPX, NDX, DJI) with multiple trade recommendations (options/futures contracts) and display live, continuously updated metrics.

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                           │
│  ┌────────────────┐         ┌──────────────────────────────┐   │
│  │  Next.js App   │◄────SSE─┤  Realtime Pricing Service    │   │
│  │  (Netlify)     │         │  (Fly.io/Render/Railway)     │   │
│  └────────┬───────┘         └──────────┬───────────────────┘   │
└───────────┼─────────────────────────────┼───────────────────────┘
            │                             │
            │ API Calls                   │ Polygon/Databento
            │ (CRUD, Snapshots)           │ Redis Cache
            ▼                             ▼
    ┌───────────────┐           ┌─────────────────┐
    │   Netlify     │           │   Redis         │
    │   Functions   │           │   (Upstash)     │
    │               │           │                 │
    │ - CRUD APIs   │           │ - Live quotes   │
    │ - Snapshot on │           │ - Hi/Lo tracks  │
    │   Publish     │           │ - Viewer counts │
    └───────┬───────┘           └─────────────────┘
            │
            │ Database/Storage
            ▼
    ┌───────────────┐
    │   Supabase    │
    │               │
    │ - Postgres DB │
    │ - RLS         │
    │ - Storage     │
    │ - Auth        │
    └───────────────┘
```

### Realtime Pricing Service

**Purpose**: Isolated service for live price streaming and metrics tracking

**Deployment**: Fly.io (recommended) / Render / Railway

**Technology**: Node.js with Express, Polygon/Databento WebSocket, Redis (ioredis)

**Core Features**:

1. **SSE Stream Endpoint**
   ```
   GET /stream?analysisId={uuid}
   Authorization: Bearer {supabase_jwt}
   ```

2. **Subscription Manager**
   - Tracks active viewers per analysis/trade
   - Symbol subscriptions management
   - Graceful cleanup (60s grace period)

3. **Polygon/Databento Integration**
   - Index quotes (Underlying): WebSocket subscription
   - Options quotes: REST snapshot every 5-10s
   - Rate limiting with circuit breaker

4. **Redis Schema**
   ```
   # Live Quotes
   quote:index:I:SPX → {price, timestamp, session_high, session_low}
   quote:option:{ticker} → {bid, ask, mid, last, timestamp}

   # Trade Trackers
   trade:{tradeId}:underlying:high → float
   trade:{tradeId}:contract:high → float

   # Subscription State
   sub:analysis:{analysisId}:viewers → int
   sub:symbol:{symbol}:trades → set of tradeIds
   ```

5. **High/Low Algorithm**
   ```javascript
   async function updateHighLow(tradeId, symbol, price, isUnderlying) {
     const prefix = isUnderlying ? 'underlying' : 'contract';

     // Update high
     const highKey = `trade:${tradeId}:${prefix}:high`;
     const currentHigh = await redis.get(highKey);
     if (!currentHigh || price > parseFloat(currentHigh)) {
       await redis.set(highKey, price);
     }

     // Update low similarly...
   }
   ```

6. **Persistence Strategy**
   - Frequent updates in Redis (every quote)
   - Periodic persistence to Supabase (every 30-60s)
   - On trade close: flush Redis → DB

### Indices Workflow System

**Complete implementation for analyses + trades with WIN/LOSS classification**

#### Database Components

**Tables**:
- `index_analyses`: Analysis posts with technical details
- `index_trades`: Options/futures trade recommendations
- `analysis_updates` & `trade_updates`: Bilingual updates
- `telegram_send_log`: Audit log with deduplication

**Key Fields**:
- `trade_price_basis`: 'CONTRACT_PRICE' or 'UNDERLYING_PRICE'
- `win_condition_met` / `loss_condition_met`: Auto-populated
- `telegram_message_id` / `telegram_published_at`: Publishing tracking

#### Edge Functions

**indices-telegram-publisher**:
- Publishes analyses, trades, updates to Telegram
- Bilingual messages (Arabic + English)
- Deduplication via payload hash
- Message templates for each entity type

**indices-trade-tracker**:
- Scheduled job (every 2-5 minutes)
- Fetches latest quotes from Polygon
- Updates prices and HPAE (Highest Price After Entry)
- Detects WIN/LOSS conditions
- Creates system updates
- Triggers Telegram notifications

**WIN/LOSS Logic**:
```typescript
// For CALL options:
- WIN if current_price >= target1_price
- LOSS if current_price <= stop_price

// For PUT options:
- WIN if current_price <= target1_price
- LOSS if current_price >= stop_price

// Uses trade_price_basis to determine comparison price
```

#### API Endpoints

- `POST /api/indices/analyses` - Create index analysis
- `POST /api/indices/analyses/[id]/trades` - Create trade with snapshot
- `GET /api/indices/contracts` - Fetch available contracts from Polygon
- `POST /api/indices/analyses/[id]/updates` - Post bilingual update
- `POST /api/indices/trades/[id]/updates` - Post trade update
- `PATCH /api/indices/trades/[id]` - Update trade status/targets

---

## Workflow Systems

### Analysis Lifecycle Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                   Analysis Creation Workflow                  │
└──────────────────────────────────────────────────────────────┘

1. Analyst Creates Analysis
   ├─ Input: Symbol, Direction, Entry, Targets, Stop Loss
   ├─ Validation: Required fields, price logic
   ├─ Chart Upload: Image to Supabase Storage
   └─ Database Insert: analyses table

2. Snapshot Generation
   ├─ Fetch Current Price: Polygon API
   ├─ Store Entry Snapshot: price_snapshots table
   └─ Initialize Validation: analysis_validations

3. Publication
   ├─ Set Status: 'published'
   ├─ Visibility Control: public/followers/subscribers/private
   ├─ Award Points: +5 points to analyst
   └─ Telegram Broadcast: If auto-publish enabled

4. Ongoing Validation (Cron Job - Every Hour)
   ├─ Fetch Active Analyses: status IN ('published', 'active')
   ├─ Get Current Prices: Polygon API
   ├─ Check Conditions:
   │  ├─ Target Hit? → Update status, notify, award points
   │  ├─ Stop Hit? → Update status, notify, deduct points
   │  └─ Expired? → Mark as expired
   ├─ Store Price Snapshots: Historical tracking
   └─ Send Notifications: In-app + Telegram

5. Analysis Completion
   ├─ Final Status: 'success', 'failed', or 'expired'
   ├─ Calculate Performance: Win rate, ROI
   ├─ Update Analyst Stats: analyzer_stats table
   └─ Award/Revoke Badges: Based on new metrics
```

### Subscription Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                   Subscription Lifecycle                      │
└──────────────────────────────────────────────────────────────┘

1. Plan Creation (Analyzer)
   ├─ Input: Name, Price, Interval, Features
   ├─ Optional: Telegram Channel ID, Max Subscribers
   ├─ Database Insert: analyzer_plans table
   └─ Validation: Channel access if provided

2. Subscription Purchase (Trader)
   ├─ Validation:
   │  ├─ Cannot subscribe to own plan
   │  ├─ Cannot subscribe twice
   │  ├─ Check max_subscribers limit
   │  └─ Verify plan is active
   ├─ Create Subscription: subscriptions table
   │  ├─ Status: 'active'
   │  ├─ Period: Calculate end date
   │  └─ Provider: 'manual' (or payment gateway)
   ├─ Generate Telegram Invite: If channel configured
   │  ├─ Single-use link
   │  ├─ 24-hour expiry
   │  └─ Store in telegram_memberships
   ├─ Financial Transaction: Record in ledger
   └─ Notifications: Email + Telegram to analyst

3. Access Control
   ├─ RLS Policies: Check has_active_subscription()
   ├─ Content Filtering: Based on visibility setting
   └─ Telegram Membership: Verify invite status

4. Renewal (Future with Payment Provider)
   ├─ Webhook: Received from provider
   ├─ Update Period: Extend current_period_end
   ├─ Create Transaction: New financial record
   └─ Notify: Confirmation to subscriber

5. Cancellation
   ├─ Mode Selection:
   │  ├─ End of Period: Keep access until period end
   │  └─ Immediate: Revoke access now
   ├─ Update Status: Set cancel_at_period_end or 'canceled'
   ├─ Revoke Telegram: Update membership status
   └─ Notifications: Confirmation + analyst alert

6. Expiration (Scheduled Job - Daily)
   ├─ Find Expired: current_period_end < NOW()
   ├─ Update Status: 'expired'
   ├─ Remove Access: RLS blocks content
   └─ Cleanup: Remove Telegram memberships
```

### Telegram Integration Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                   Telegram Communication Flow                 │
└──────────────────────────────────────────────────────────────┘

1. Bot Setup (One-time)
   ├─ Create Bot: @BotFather
   ├─ Store Token: admin_settings table
   ├─ Set Webhook: /api/telegram/webhook
   └─ Test: /api/telegram/test

2. User Connection
   ├─ Generate Link Code: 6-digit code
   ├─ User Sends: /start <code> to bot
   ├─ Webhook Receives: Telegram user_id
   ├─ Link Accounts: telegram_users table
   └─ Confirm: Success message

3. Channel Connection (Analyzer)
   ├─ Add Bot: As admin to channel
   ├─ Verify Access: /api/telegram/verify-channel
   ├─ Store Config: analyzer_telegram_channels
   └─ Settings: Notification preferences

4. Message Sending
   ├─ Queue: telegram_outbox table
   │  ├─ Priority: high/normal/low
   │  ├─ Retry Logic: Exponential backoff
   │  └─ Status: pending/sent/failed
   ├─ Process: telegram-sender edge function
   │  ├─ Rate Limiting: Telegram API limits
   │  ├─ Format: HTML/Markdown
   │  └─ Attachments: Images, buttons
   ├─ Send: Bot API request
   └─ Log: telegram_send_log

5. Broadcasting
   ├─ Trigger: New analysis, target hit, update
   ├─ Filter: Subscribers only / all followers
   ├─ Language: English/Arabic/Both
   ├─ Template: Formatted message
   └─ Batch: Send to all members

6. Invite Link Generation
   ├─ Channel: exportChatInviteLink API
   ├─ Options: Single-use, expiry time
   ├─ Store: telegram_memberships
   └─ Deliver: In subscription confirmation
```

---

## Ranking & Recommendation Systems

### Ranking System Architecture

**Purpose**: Transparent, auditable points and badge system rewarding quality contributions

**Core Components**:

1. **Ledger System** - Immutable log of all point events
2. **Balance Cache** - Fast access to current totals
3. **Badge Engine** - Automated badge awarding
4. **Leaderboards** - Cached rankings
5. **Anti-Gaming** - Multiple fraud prevention layers

### Scoring Rules

#### Analyst Points

| Event | Points | Requirements |
|-------|--------|-------------|
| Analysis Created | +5 | Valid with targets & stop loss |
| Target Hit | +10 | Per target, system-validated |
| Stop Loss Hit | -10 | System-validated |

**Daily Caps**: Max 10 analyses/day (50 points max from creation)

#### Trader Points

| Event | Points | Requirements |
|-------|--------|-------------|
| Like | +1 | Unique per analysis |
| Bookmark | +2 | Unique per analysis |
| Repost | +3 | Unique per analysis |
| Comment | +3 | Quality rules (25+ chars, not spam) |
| Rating | +5 | Analysis closed, not own |

**Daily Caps**: Max 100 points/day from trader activities
**Account Requirements**: 7+ days old, email verified

### Badge System

#### Analyst Badges

- **🥉 Consistent Analyst** (Bronze): 60-69% win rate, 20+ closed analyses
- **🥈 Professional Analyst** (Silver): 70-79% win rate, 40+ closed, 3+ targets in 30 days
- **🥇 Elite Analyst** (Gold): 80-89% win rate, 60+ closed, max 2 consecutive stops
- **💎 Legend** (Diamond): 90%+ win rate, 100+ closed, active in 60 days

#### Trader Badges

- **🥈 Insightful Rater** (Silver): 50+ ratings, 60%+ accuracy
- **🥉 Market Supporter** (Bronze): 20+ reposts, 10+ successful
- **🥇 Hybrid Trader** (Gold): 70%+ rating accuracy, 10+ analysts followed, 10+ symbols

### Anti-Gaming Protections

1. **Account Age**: 7+ days for trader points
2. **Daily Caps**: Prevent spam accumulation
3. **Uniqueness Constraints**: Database-level uniqueness
4. **Quality Scoring**: Content analysis for comments
5. **Rate Limiting**: Flag >20 actions/minute
6. **Immutable Ledger**: No manual adjustments

### Recommendation System

**Purpose**: Personalized content discovery based on engagement patterns

#### Feed Recommendations (Analyses)

**Scoring Features** (Weighted):
- Recency Decay (30%): Newer content prioritized
- Symbol Affinity (25%): User's symbol interactions
- Analyzer Affinity (20%): User's analyzer interactions
- Analyzer Quality (15%): Win rate + sample size
- Engagement Momentum (10%): Recent popularity
- Follower Relationship (20%): Direct follows boost

**Candidate Generation**:
- Analyses from followed analyzers
- Analyses for followed symbols
- Trending analyses (24h high engagement)
- Excludes own analyses and recently viewed

#### Analyzer Recommendations

**Scoring Features**:
- Quality metrics (50%): Win rate and sample size
- Co-follow count (30%): Social proof
- Recency bonus (20%): New analyzer boost

**Candidates**:
- Co-follow suggestions
- Top-performing analyzers
- New analyzers

#### Symbol Recommendations

**Scoring Features**:
- Followed analyzer activity (50%)
- Analysis volume (30%)
- Follower count (20%)

**Candidates**:
- Symbols analyzed by followed analyzers
- Trending symbols
- Symbols with growing followers

### Materialized Views

```sql
-- Trending analyses (24h engagement)
CREATE MATERIALIZED VIEW trending_analyses AS
SELECT
  entity_id as analysis_id,
  COUNT(*) as engagement_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE event_type = 'view') as view_count,
  COUNT(*) FILTER (WHERE event_type = 'like') as like_count
FROM engagement_events
WHERE entity_type = 'analysis'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY entity_id;

-- User symbol affinity (30d)
CREATE MATERIALIZED VIEW user_symbol_affinity AS
SELECT
  user_id,
  symbol_id,
  COUNT(*) as interaction_count,
  MAX(created_at) as last_interaction
FROM engagement_events e
JOIN analyses a ON e.entity_id = a.id
WHERE e.entity_type = 'analysis'
  AND e.created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id, symbol_id;
```

**Refresh Strategy**: Hourly via cron
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY trending_analyses;
```

---

## Subscription System

### Architecture Overview

Manual subscription system with architecture compatible with future payment providers (Stripe, PayPal).

### Key Features

- Immediate activation for testing
- Telegram channel integration
- Flexible billing intervals
- Subscriber limits per plan
- RLS-enforced access control
- Visibility-based content filtering

### Access Control Flow

```
User Requests Content
    ↓
Check Visibility Setting
    ├─ Public → Allow all
    ├─ Followers → Check follows table
    ├─ Subscribers → Check has_active_subscription()
    └─ Private → Owner only
        ↓
    RLS Policy Enforces
        ↓
    Return Content or 403
```

### Helper Functions

```sql
-- Check active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(
  p_subscriber_id UUID,
  p_analyst_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = p_subscriber_id
      AND analyst_id = p_analyst_id
      AND status = 'active'
      AND current_period_end > NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get subscriber count
CREATE OR REPLACE FUNCTION get_plan_subscriber_count(
  p_plan_id UUID
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM subscriptions
    WHERE plan_id = p_plan_id
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Future Payment Provider Integration

**Ready for**:
- Stripe, PayPal, Square
- Webhook endpoints: `/api/webhooks/[provider]`
- Provider fields: `provider`, `provider_subscription_id`, `metadata` (JSONB)
- Status mapping: Matches common provider states

---

## Financial Management System

### Architecture Design

**Modular, isolated financial tracking with zero impact on existing platform logic**

### Key Principles

- **Zero Impact**: Event-based integration
- **Ledger-First**: Immutable financial log
- **Role-Based Access**: Granular permissions
- **Payment Agnostic**: Compatible with any gateway
- **Audit Trail**: Complete operation history

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Existing Platform                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Analyses   │  │ Subscriptions │  │   Profiles   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
└─────────┼──────────────────┼──────────────────┼───────────────┘
          │                  │                  │
          │    Event Bus (Webhooks/Messages)   │
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼───────────────┐
│           FINANCIAL MANAGEMENT MODULE (Isolated)              │
├───────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   Financial    │  │   Subscriber   │  │   Payout      │ │
│  │   Ledger       │  │   Manager      │  │   Manager     │ │
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘ │
│           │                    │                    │         │
│  ┌────────▼────────────────────▼────────────────────▼───────┐ │
│  │              Financial Database Schema                   │ │
│  │  • transactions  • revenue_splits  • payouts            │ │
│  │  • platform_fees • analyst_earnings • audit_log         │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Core Tables

#### financial_transactions
Immutable ledger of all financial events

```sql
CREATE TABLE financial_transactions (
  id UUID PRIMARY KEY,
  transaction_type TEXT, -- payment, renewal, refund, etc.
  subscription_id UUID REFERENCES subscriptions(id),
  analyst_id UUID REFERENCES profiles(id),
  subscriber_id UUID REFERENCES profiles(id),

  -- Financial details
  gross_amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  net_amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Provider info
  provider TEXT DEFAULT 'manual',
  provider_transaction_id TEXT,

  -- Status
  status TEXT, -- pending, completed, failed, reversed
  transaction_date TIMESTAMPTZ DEFAULT now(),

  -- Audit
  created_by UUID REFERENCES profiles(id),
  notes TEXT,
  metadata JSONB
);
```

#### platform_fee_rules
Configurable revenue splits

```sql
CREATE TABLE platform_fee_rules (
  id UUID PRIMARY KEY,
  rule_type TEXT, -- analyst, plan, global
  analyst_id UUID REFERENCES profiles(id),
  plan_id UUID REFERENCES analyzer_plans(id),

  fee_type TEXT, -- percentage, fixed
  fee_value NUMERIC(10,2),
  priority INTEGER,

  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_until TIMESTAMPTZ
);
```

#### analyst_earnings_summary
Pre-calculated earnings (materialized view pattern)

```sql
CREATE TABLE analyst_earnings_summary (
  analyst_id UUID PRIMARY KEY,

  -- All-time
  total_gross_cents BIGINT DEFAULT 0,
  total_platform_fee_cents BIGINT DEFAULT 0,
  total_net_cents BIGINT DEFAULT 0,

  -- Current month
  month_gross_cents BIGINT DEFAULT 0,
  month_net_cents BIGINT DEFAULT 0,

  -- Subscribers
  active_subscribers_count INTEGER DEFAULT 0,
  total_subscribers_all_time INTEGER DEFAULT 0,

  -- Payouts
  total_paid_out_cents BIGINT DEFAULT 0,
  pending_payout_cents BIGINT DEFAULT 0,

  last_calculated_at TIMESTAMPTZ DEFAULT now()
);
```

### Event-Based Integration

**Subscription Created Flow**:
```
User Subscribes
    ↓
Subscription Record Created
    ↓
[Event Trigger]
    ↓
Financial Module Listens
    ↓
Create Transaction in Ledger
    ↓
Update Analyst Earnings Summary
    ↓
Update Subscriber Revenue History
    ↓
Update Plan Performance Metrics
```

**Async Processing**:
1. Transaction Recording: Immediate
2. Summary Updates: Queued (within seconds)
3. Analytics Recalculation: Batch (hourly/daily)
4. Payout Generation: Scheduled (monthly)

---

## Performance & Scalability

### Scalability Targets

**Concurrent Users**:
- 1,000 simultaneous viewers
- 100 active trades per analysis
- 50 analyses with active trades

**Data Throughput**:
- Quotes processed: 1-10/sec per symbol
- Database writes: 6/min per trade (10s persistence)
- SSE broadcasts: Match quote rate

**Latency Goals**:
- Page load (initial): <1s
- SSE connection: <500ms
- Quote update → UI: <200ms
- Database query: <100ms

### Performance Optimizations

#### Database

1. **Indexes**: All foreign keys and query columns indexed
2. **RLS Functions**: STABLE functions cached within transaction
3. **Composite Indexes**: Multi-column indexes for common queries
4. **Materialized Views**: Pre-computed aggregations
5. **Connection Pooling**: Supabase handles automatically

#### Caching

1. **Redis**: Live quotes, hi/lo tracking, viewer counts
2. **React Cache**: Session data within requests
3. **Supabase Client**: Built-in caching
4. **Next.js**: Automatic route caching
5. **CDN**: Static assets via Netlify Edge

#### Code Splitting

1. **Route-based**: Automatic by Next.js App Router
2. **Component-level**: Lazy loading for heavy components
3. **Third-party**: Dynamic imports for libraries

### Cost Analysis

**Monthly Costs (Moderate Traffic)**:

| Service | Cost | Notes |
|---------|------|-------|
| Netlify | $0-25 | Free tier: 100GB bandwidth |
| Supabase | $0-25 | Free tier: 500MB DB, 1GB transfer |
| Realtime Service (Fly.io) | $3-8 | 512MB RAM, 1 CPU |
| Redis (Upstash) | $5-10 | 1M commands/day |
| Databento Live API | $5 | ~20 MB/day streaming |
| Polygon API | $49-199 | Depends on plan |
| Screenshot API | $5-10 | ~$0.001/screenshot |
| **Total** | **$67-282/month** | For 10k MAU |

**Optimization Tips**:
- Use Databento for real-time (vs Polygon $499/mo)
- Reduce persistence frequency if needed
- Cache aggressively
- Implement lazy loading
- Optimize image sizes

---

## Security Architecture

### Defense in Depth

**1. Transport Security**
- HTTPS enforced (production)
- HTTP-only cookies for sessions
- CSRF protection via Supabase
- WebSocket over TLS (wss://)

**2. Authentication**
- Supabase Auth (industry standard)
- JWT-based sessions (scalable)
- Secure password hashing (bcrypt)
- OTP support for passwordless login
- No password storage in client

**3. Authorization**
- Database level: Row Level Security (RLS)
- Application level: Server-side session checks
- UI level: Conditional rendering
- Middleware level: Route protection
- Service role: Bypasses RLS for batch operations

**4. Input Validation**
- Client-side: Form validation
- Server-side: Supabase client sanitization
- Type checking: TypeScript
- Email validation: Regex patterns
- SQL injection: Parameterized queries

**5. Data Protection**
- No secrets in client code
- Environment variables for config
- Secure database connections
- Minimal data exposure
- API keys server-side only

### API Key Security

**Never in Browser**:
- Polygon API key: Server-only
- Databento API key: Server-only
- Supabase Service Role: Server-only
- Internal API keys: Server-only

**Environment Variables**:
```bash
# Netlify/Server
POLYGON_API_KEY=xxx
DATABENTO_API_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
REALTIME_SERVICE_URL=https://xxx.fly.dev
INTERNAL_API_KEY=xxx

# Realtime Service
POLYGON_API_KEY=xxx
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
REDIS_URL=xxx
```

### Rate Limiting

**API Endpoints**:
- 100 requests/min per IP for public
- No limit for authenticated admins
- 5 concurrent SSE connections per user

**Telegram**:
- Respects Telegram API limits
- Exponential backoff on errors
- Queue with priority system

### Fraud Prevention

**Points System**:
- Account age restrictions (7 days)
- Daily caps per user
- Quality scoring for comments
- Uniqueness constraints
- Rate limiting flags
- Immutable ledger

**Financial System**:
- Transaction limits
- Anomaly detection
- Manual review for high-value
- Complete audit trail

---

## Monitoring & Observability

### Health Checks

**Realtime Service**:
```bash
GET /health

Response:
{
  "status": "ok",
  "uptime": 86400,
  "activeSubscriptions": 12,
  "lastUpdate": "2025-01-05T10:30:00Z",
  "quotesProcessed": 45120,
  "redisConnected": true,
  "supabaseConnected": true
}
```

**Key Metrics to Track**:

1. **Latency**:
   - SSE connection time (p50, p95, p99)
   - Polygon API response time
   - Redis operation time
   - Database query time

2. **Throughput**:
   - SSE connections/sec
   - Quotes processed/sec
   - Database writes/min
   - API requests/min

3. **Errors**:
   - Polygon rate limits
   - Redis connection failures
   - SSE disconnects
   - RLS policy violations

4. **Business Metrics**:
   - Active trades count
   - Viewers per analysis
   - Trade outcomes (TP hit rate)
   - Subscription conversions
   - User engagement

### Logging

**Supabase Edge Functions**:
- View in Supabase Dashboard → Edge Functions → Logs
- Search by function name
- Filter by error level

**Realtime Service**:
```bash
# Fly.io
fly logs -a realtime-pricing-service

# Look for:
INFO - Service is running           ✅ Healthy
WARNING - Connection closed         ⚠️  Reconnecting
ERROR - Authentication failed       🚨 Check API key
INFO - Processed 10 updates         ✅ Normal
INFO - Target hit detected          🎯 Trade closed
```

### Alerts

Set up alerts for:
- Service downtime (>2 minutes)
- No updates received (>30 seconds)
- Database connection errors
- High error rate (>5% of requests)
- Memory usage >80%
- Failed transaction rate >1%
- Suspicious activity flagged

### Monitoring Queries

```sql
-- Check update frequency
SELECT
  COUNT(*) as active_trades,
  MAX(updated_at) as last_update,
  EXTRACT(EPOCH FROM (NOW() - MAX(updated_at))) as seconds_since_last
FROM index_trades
WHERE status = 'active';

-- Top scorers
SELECT p.full_name, upb.analyst_points_all_time
FROM user_points_balance upb
JOIN profiles p ON upb.user_id = p.id
ORDER BY analyst_points_all_time DESC
LIMIT 10;

-- Recent transactions
SELECT
  transaction_type,
  COUNT(*),
  SUM(gross_amount_cents) / 100.0 as total_usd
FROM financial_transactions
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY transaction_type;

-- Telegram queue
SELECT
  status,
  COUNT(*),
  AVG(retry_count) as avg_retries
FROM telegram_outbox
GROUP BY status;
```

---

## Appendix: System Diagrams

### Data Flow: End-to-End Analysis Lifecycle

```
Analyst Creates Analysis
    ↓
[API: POST /api/analyses]
    ↓
Validate Input
    ↓
Upload Chart Image → Supabase Storage
    ↓
Insert analyses Record
    ↓
Fetch Entry Price → Polygon API
    ↓
Store price_snapshots Record
    ↓
Award Points (+5) → user_points_ledger
    ↓
[If auto_publish_telegram]
    ↓
Queue Telegram Message → telegram_outbox
    ↓
[Edge Function: telegram-sender]
    ↓
Send to Channel → Telegram Bot API
    ↓
Update telegram_published_at
    ↓
[Hourly Cron: price-validator]
    ↓
Fetch Active Analyses
    ↓
For Each Analysis:
    ↓
Get Current Price → Polygon API
    ↓
Compare with Targets/Stop
    ↓
[If Target Hit]
    ├─ Update status → 'success'
    ├─ Award Points (+10)
    ├─ Create Notification
    └─ Send Telegram Alert
    ↓
[If Stop Hit]
    ├─ Update status → 'failed'
    ├─ Deduct Points (-10)
    ├─ Create Notification
    └─ Send Telegram Alert
    ↓
Update analyst_stats
    ↓
Evaluate Badges → badgeService
    ↓
Regenerate Leaderboard Cache
```

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER DEVICES                            │
│  [Web Browser] [Mobile Browser] [Telegram App]                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 │ HTTPS / WSS
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       NETLIFY EDGE CDN                           │
│  • Static Assets Caching                                         │
│  • SSL Termination                                               │
│  • DDoS Protection                                               │
└────────────────┬────────────────────────────────────────────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Next.js │ │ Supabase│ │Fly.io   │
│ Server  │ │ Edge    │ │Realtime │
│         │ │Functions│ │Service  │
│• SSR    │ │         │ │         │
│• API    │ │• Cron   │ │• SSE    │
│• Auth   │ │• Batch  │ │• WS     │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE PLATFORM                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │   Storage    │  │  Real-time   │          │
│  │   Database   │  │   Buckets    │  │  Channels    │          │
│  │              │  │              │  │              │          │
│  │• RLS         │  │• Images      │  │• WebSocket   │          │
│  │• Indexes     │  │• Charts      │  │• Broadcasts  │          │
│  │• Functions   │  │• Avatars     │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## References & Further Reading

- **Next.js Documentation**: https://nextjs.org/docs
- **Supabase Documentation**: https://supabase.com/docs
- **Polygon.io API**: https://polygon.io/docs
- **Databento API**: https://databento.com/docs
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **shadcn/ui Components**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com/docs

---

**Document Version**: 1.0
**Last Updated**: January 2025
**Maintained By**: AnalyzingHub Development Team
