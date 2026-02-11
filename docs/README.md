# AnalyzingHub Platform

**A professional market analysis platform connecting analysts with traders through real-time trade validation, subscription management, and comprehensive performance tracking.**

---

## Platform Overview

AnalyzingHub is a social platform designed for market analysts and traders, featuring:

- **Analysis Publishing**: Analysts share market insights with chart images and detailed commentary
- **Real-time Trade Validation**: Live tracking of options trades with automatic target/stop detection
- **Subscription System**: Multi-tier subscription plans with Telegram channel integration
- **Performance Metrics**: Automated success rate calculation, rankings, and leaderboards
- **Telegram Integration**: Bot-powered notifications and channel broadcasts
- **Comprehensive Reports**: Automated daily/weekly/monthly performance reports
- **Multi-language Support**: Full English and Arabic (RTL) support

---

## Major Subsystems

### 1. **Authentication & Authorization**
- Supabase Auth with email/password and OTP login
- Role-based access control (SuperAdmin, Analyzer, Trader)
- Row Level Security (RLS) on all database tables
- Secure session management

### 2. **Analysis Management**
- Create and publish market analyses with chart images
- Support for stocks and indices (SPX, NDX, DJI)
- Target and stop loss tracking
- Multi-plan analysis distribution
- Visibility controls (Public/Subscribers/Private)

### 3. **Indices Hub**
- **Real-time options trading**: Live price updates for SPX/NDX/DJI options
- **Contract tracking**: Automatic entry price snapshots, high/low tracking
- **Target/Stop Detection**: Automated notifications when conditions are met
- **Sub-500ms latency**: End-to-end from market to user interface
- **Databento Integration**: WebSocket streaming for live quotes

### 4. **Subscription System**
- Multi-tier plans per analyzer
- Monthly/yearly billing
- Telegram channel access integration
- Automatic expiration handling
- Subscriber limits per plan

### 5. **Telegram Bot**
- Personal bot for all users
- Channel broadcasting for analysts
- Real-time trade notifications
- Symbol query feature
- Multi-language message support
- Bot menu for quick actions

### 6. **Reports System**
- Daily/weekly/monthly performance reports
- PDF generation with embedded charts
- Email and Telegram delivery
- Multi-language support (EN/AR)
- Access control per report type

### 7. **Rankings & Reputation**
- Success rate calculation
- Leaderboards (all-time, monthly, weekly)
- Analyzer ratings (1-5 stars)
- Badge system for achievements
- Recommendation engine

### 8. **Social Features**
- Follow/unfollow analysts
- Like, comment, repost analyses
- Notifications for social interactions
- Activity feed
- User profiles with trading statistics

---

## Tech Stack

### Frontend
- **Framework**: Next.js 13+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with RTL support
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React
- **State Management**: React Context + Server State
- **Real-time**: Server-Sent Events (SSE)

### Backend
- **Database**: PostgreSQL via Supabase (30+ tables)
- **Authentication**: Supabase Auth (JWT-based)
- **Storage**: Supabase Storage (images, PDFs, reports)
- **API**: Next.js API Routes (serverless)
- **Edge Functions**: Supabase Edge Functions (Deno)

### Real-time Services
- **Databento**: Live market data streaming (<100ms)
- **Python Service**: Trade monitoring (Fly.io)
- **Redis**: Upstash for high-frequency state
- **WebSocket**: Databento WebSocket client
- **SSE**: Server-Sent Events for frontend updates

### Integrations
- **Polygon.io**: Market data, contract information, Greeks
- **Telegram Bot API**: Notifications and broadcasts
- **ZeptoMail**: Email delivery for reports
- **Puppeteer**: PDF generation

### Deployment
- **Main App**: Netlify (serverless Next.js)
- **Real-time Service**: Fly.io (databento-live-service)
- **Database**: Supabase (managed PostgreSQL)
- **CDN**: Netlify CDN + Supabase Storage CDN

---

## Project Structure

```
/app                          # Next.js app directory
  ├── /api                    # API routes (120+ endpoints)
  ├── /dashboard              # Protected dashboard routes
  ├── /login                  # Authentication pages
  ├── /register
  ├── /share/[id]             # Public analysis sharing
  └── page.tsx                # Landing page

/components
  ├── /admin                  # Admin dashboard components
  ├── /analysis               # Analysis creation/viewing
  ├── /auth                   # Authentication forms
  ├── /dashboard              # Dashboard layout
  ├── /indices                # Indices Hub components
  ├── /landing                # Landing page sections
  ├── /profile                # User profiles
  ├── /rankings               # Leaderboards
  ├── /recommendations        # Recommended content
  ├── /reports                # Reports viewing
  ├── /settings               # Settings pages
  ├── /subscriptions          # Subscription management
  ├── /telegram               # Telegram integration UI
  └── /ui                     # shadcn/ui components (40+)

/lib
  ├── /auth                   # Authentication utilities
  ├── /i18n                   # Internationalization
  ├── /supabase               # Supabase clients
  ├── /telegram               # Telegram utilities
  └── /types                  # TypeScript definitions

/services
  ├── /entitlements           # Subscription entitlements
  ├── /indices                # Indices Hub services
  ├── /price                  # Price validation
  ├── /recommendations        # Recommendation engine
  ├── /scoring                # Success rate calculation
  ├── /telegram               # Telegram bot service
  └── /validation             # Input validation

/supabase
  ├── /functions              # Edge functions (20+)
  └── /migrations             # Database migrations (120+)

/databento-live-service       # Python real-time service
  └── /src
      ├── main.py             # Service entry point
      └── trade_monitor.py    # Trade monitoring logic

/realtime-pricing-service     # Node.js real-time service
  └── /src
      ├── index.ts            # HTTP server
      ├── polygon-websocket.ts# WebSocket client
      └── sse-handler.ts      # SSE streaming

/scripts                      # Utility scripts (100+)
  ├── create-analyzer-user.ts
  ├── setup-telegram-webhook.ts
  ├── test-*.ts               # Testing scripts
  └── check-*.ts              # Verification scripts

middleware.ts                 # Route protection
```

---

## Database Schema Overview

### Core Tables (30+ total)

**Authentication & Users**:
- `profiles` - User profiles with role assignments
- `roles` - SuperAdmin, Analyzer, Trader
- `otp_codes` - One-time password codes for login

**Content**:
- `analyses` - Market analysis posts
- `symbols` - Stock/index symbols
- `price_snapshots` - Historical price data
- `analysis_ratings` - User ratings for analyses

**Social**:
- `follows` - Follow relationships
- `likes` - Analysis likes
- `comments` - Comments with replies
- `reposts` - Analysis reposts
- `saves` - Saved analyses
- `notifications` - User notifications

**Subscriptions**:
- `analyzer_plans` - Subscription plans
- `subscriptions` - Active subscriptions
- `telegram_memberships` - Telegram channel access
- `subscription_transactions` - Payment records

**Telegram**:
- `telegram_users` - User-bot linkage
- `telegram_channels` - Analyzer channels
- `telegram_outbox` - Message queue

**Indices Hub**:
- `indices_reference` - SPX, NDX, DJI data
- `index_analyses` - Index chart analyses
- `index_trades` - Trade recommendations
- `index_trade_updates` - Update timeline
- `options_chain_cache` - Contract data cache

**Reports**:
- `daily_trade_reports` - Generated reports
- Storage bucket: `daily-reports`

**Rankings**:
- `analyzer_stats` - Performance metrics
- `badges` - Achievement badges
- `analyzer_badges` - Earned badges

**Admin**:
- `admin_settings` - System configuration
- `engagement_events` - Analytics tracking

---

## Key Features

### For Analysts
- Publish market analyses with charts
- Create multiple subscription tiers
- Real-time trade tracking (Indices Hub)
- Telegram channel integration
- Performance reports (daily/weekly/monthly)
- Subscriber management
- Revenue tracking
- Rankings and reputation

### For Traders
- Follow favorite analysts
- Subscribe to premium content
- Receive Telegram notifications
- View real-time trade performance
- Access performance reports
- Rate and review analysts
- Personalized recommendations

### For Administrators
- User management
- Content moderation
- System settings
- Analytics dashboard
- Financial oversight
- Badge management

---

## Performance Characteristics

### Real-time System
- **Latency**: <500ms end-to-end (market to UI)
- **Update Frequency**: Sub-second for active trades
- **Concurrent Users**: 1,000+ supported
- **Data Sources**: Databento (primary), Polygon (fallback)

### Application
- **Page Load**: <2s first load, <500ms navigations
- **API Response**: <200ms average
- **Database Queries**: Optimized with indexes
- **CDN Caching**: Static assets, images

### Costs (Moderate Traffic)
- **Databento**: $8/month (10 symbols)
- **Fly.io**: $5-15/month (2 services)
- **Supabase**: Free tier or $25/month
- **Netlify**: Free tier or $19/month
- **Redis**: Free tier (Upstash)
- **Total**: $50-100/month estimated

---

## Entry Points

### User Interfaces
- `/` - Landing page
- `/login` - User login
- `/register` - New user registration
- `/dashboard` - Main dashboard (role-based)
- `/dashboard/indices` - Indices Hub (analysts)
- `/dashboard/subscriptions` - Subscribe to analysts
- `/dashboard/rankings` - View leaderboards
- `/dashboard/reports` - View performance reports
- `/share/[id]` - Public analysis view

### API Endpoints (120+ total)
- `/api/auth/*` - Authentication
- `/api/analyses/*` - Analysis management
- `/api/indices/*` - Indices Hub APIs
- `/api/subscriptions/*` - Subscription management
- `/api/telegram/*` - Telegram integration
- `/api/reports/*` - Report generation
- `/api/admin/*` - Admin operations

### Background Jobs
- `indices-trade-tracker` - Real-time price updates (1 minute)
- `expired-trades-closer` - Close expired trades (5 minutes)
- `activation-condition-checker` - Check activation conditions (5 minutes)
- `auto-daily-reports-scheduler` - Daily report generation (2x daily)
- `subscription-expiration-processor` - Process expirations (daily)
- `telegram-outbox-processor` - Send queued messages (1 minute)

---

## Security Model

### Authentication
- JWT-based sessions via Supabase Auth
- HTTP-only secure cookies
- OTP login option (6-digit codes)
- Password hashing (bcrypt via Supabase)

### Authorization
- Role-based access control (RBAC)
- Row Level Security (RLS) on all tables
- Server-side validation on all mutations
- Service role key NEVER exposed to client

### API Security
- Rate limiting via Supabase
- Input validation on all endpoints
- CORS configuration
- CSRF protection
- SQL injection prevention

---

## Development Commands

```bash
# Development
npm run dev                        # Start dev server (port 3000)
npm run build                      # Build for production
npm run typecheck                  # TypeScript validation

# Telegram
npm run telegram:status            # Check bot status
npm run telegram:setup             # Setup webhook
npm run telegram:menu              # Configure bot menu

# User Management
npm run create:analyzer            # Create analyzer user
npm run upgrade:analyzer           # Upgrade to analyzer role

# Testing & Debugging
npm run test:indices:telegram      # Test Indices Hub Telegram
npm run test:daily-report          # Test daily report generation
npm run check:channels             # Check Telegram channels
npm run verify:cron                # Verify cron jobs

# Maintenance
npm run update:prices              # Manual price update
npm run clear:cache                # Clear options cache
```

---

## Documentation

This documentation is organized into the following guides:

1. **SETUP_AND_INSTALLATION.md** - Complete setup from scratch
2. **SYSTEM_ARCHITECTURE.md** - Architecture and design patterns
3. **OPERATIONS_AND_DEPLOYMENT.md** - Deployment procedures
4. **TROUBLESHOOTING_AND_FIXES.md** - Common issues and solutions
5. **FEATURE_IMPLEMENTATION_GUIDE.md** - Feature deep-dives
6. **TELEGRAM_AND_REPORTS.md** - Telegram and reporting systems
7. **SECURITY_AND_AUTH.md** - Security best practices
8. **INDICES_HUB_COMPLETE.md** - Indices Hub comprehensive guide

---

## Quick Start

```bash
# 1. Clone and install
git clone <repository>
cd project
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Setup database
# Apply migrations via Supabase Dashboard

# 4. Create admin account
npm run create:analyzer

# 5. Setup Telegram (optional)
npm run telegram:setup

# 6. Start development
npm run dev
```

Visit http://localhost:3000

---

## Support & Contribution

- **Documentation**: See `/docs` directory
- **Issues**: Check TROUBLESHOOTING_AND_FIXES.md
- **Architecture**: See SYSTEM_ARCHITECTURE.md
- **Security**: See SECURITY_AND_AUTH.md

---

## License

Proprietary - All Rights Reserved
