# AnalyzingHub Platform

A professional market analysis platform connecting analysts with traders through real-time trade validation, subscription management, and comprehensive performance tracking.

---

## Overview

AnalyzingHub is a social platform designed for market analysts and traders, featuring:

- **Real-time Trade Validation**: Live tracking of options trades with automatic target/stop detection (<500ms latency)
- **Subscription System**: Multi-tier subscription plans with Telegram channel integration
- **Performance Metrics**: Automated success rate calculation, rankings, and leaderboards
- **Telegram Integration**: Bot-powered notifications and channel broadcasts
- **Comprehensive Reports**: Automated daily/weekly/monthly performance reports with PDF generation
- **Multi-language Support**: Full English and Arabic (RTL) support

---

## Tech Stack

- **Frontend**: Next.js 13+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL with RLS), Next.js API Routes
- **Real-time**: Databento Live API, Redis (Upstash), SSE streaming
- **Integrations**: Telegram Bot, Polygon.io API, ZeptoMail SMTP
- **Deployment**: Netlify (main app), Fly.io (real-time services)

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Setup database
# Apply migrations via Supabase Dashboard

# 4. Create admin account
npm run create:analyzer

# 5. Start development
npm run dev
```

Visit http://localhost:3000

---

## Documentation

Complete documentation is available in the `/docs` directory:

### 📚 Core Documentation

1. **[Setup and Installation](./docs/SETUP_AND_INSTALLATION.md)**
   - Complete setup from scratch
   - Environment configuration
   - Database setup
   - Telegram bot configuration
   - API integrations

2. **[System Architecture](./docs/SYSTEM_ARCHITECTURE.md)**
   - Platform architecture and design patterns
   - Database schema (30+ tables)
   - Real-time systems architecture
   - Performance characteristics
   - Security model

3. **[Operations and Deployment](./docs/OPERATIONS_AND_DEPLOYMENT.md)**
   - Deployment procedures (Netlify, Fly.io)
   - Production checklist
   - Monitoring and logging
   - Performance optimization
   - Cost optimization

4. **[Troubleshooting and Fixes](./docs/TROUBLESHOOTING_AND_FIXES.md)**
   - Common issues and solutions (45+ documented)
   - Diagnostic procedures
   - Quick fix reference
   - Error message catalog

### 🔧 Feature Documentation

5. **[Feature Implementation Guide](./docs/FEATURE_IMPLEMENTATION_GUIDE.md)**
   - Trading system features
   - Indices Hub (real-time options)
   - Subscription & monetization
   - Reports & analytics
   - Rankings & recommendations
   - Internationalization

6. **[Telegram and Reports](./docs/TELEGRAM_AND_REPORTS.md)**
   - Telegram bot setup and configuration
   - Channel integration for broadcasters
   - Broadcasting system
   - Reports generation and delivery
   - Multi-language support

7. **[Security and Authentication](./docs/SECURITY_AND_AUTH.md)**
   - Security architecture (defense in depth)
   - Authentication system
   - Row-Level Security (RLS) policies
   - API security
   - Credential management
   - Security monitoring

---

## Key Features

### For Analysts
- Publish market analyses with charts
- Real-time trade tracking (Indices Hub)
- Multiple subscription tiers
- Telegram channel integration
- Performance reports
- Revenue tracking

### For Traders
- Follow favorite analysts
- Subscribe to premium content
- Real-time trade updates
- Performance reports
- Rate and review analysts
- Personalized recommendations

### For Administrators
- User management
- Content moderation
- System analytics
- Financial oversight

---

## Project Structure

```
/app                    # Next.js app directory (120+ API routes)
/components             # React components (40+ UI components)
/lib                    # Utilities and libraries
/services               # Business logic services
/supabase               # Database migrations & edge functions
/databento-live-service # Python real-time service (Fly.io)
/docs                   # Comprehensive documentation
```

---

## Development Commands

```bash
# Development
npm run dev                        # Start dev server
npm run build                      # Production build
npm run typecheck                  # TypeScript validation

# Telegram
npm run telegram:setup             # Setup bot webhook
npm run telegram:status            # Check bot status
npm run telegram:menu              # Configure bot menu

# Testing
npm run test:indices:telegram      # Test Indices Hub
npm run test:daily-report          # Test reports
npm run check:channels             # Check Telegram channels

# Maintenance
npm run update:prices              # Manual price update
npm run clear:cache                # Clear caches
```

---

## Environment Variables

Required environment variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Application
NEXT_PUBLIC_APP_BASE_URL=

# Telegram (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

# Polygon API (optional)
POLYGON_API_KEY=

# Email (optional)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
```

See [SETUP_AND_INSTALLATION.md](./docs/SETUP_AND_INSTALLATION.md) for complete configuration details.

---

## Performance

- **Latency**: <500ms end-to-end (market to UI)
- **Concurrent Users**: 1,000+ supported
- **Page Load**: <2s first load, <500ms navigations
- **Cost**: $50-100/month (moderate traffic)

---

## Security

- JWT-based authentication via Supabase Auth
- Row Level Security (RLS) enabled on all tables
- API rate limiting and input validation
- HTTPS enforced in production
- Regular security audits

See [SECURITY_AND_AUTH.md](./docs/SECURITY_AND_AUTH.md) for complete security documentation.

---

## Support

For detailed information on any topic:

- **Setup Issues**: See [Troubleshooting Guide](./docs/TROUBLESHOOTING_AND_FIXES.md)
- **Architecture Questions**: See [System Architecture](./docs/SYSTEM_ARCHITECTURE.md)
- **Deployment Help**: See [Operations Guide](./docs/OPERATIONS_AND_DEPLOYMENT.md)
- **Feature Implementation**: See [Feature Guide](./docs/FEATURE_IMPLEMENTATION_GUIDE.md)

---

## License

Proprietary - All Rights Reserved

---

## Documentation Index

### Complete Documentation List

| Document | Description | Lines |
|----------|-------------|-------|
| [README](./docs/README.md) | Platform overview and quick links | 400+ |
| [Setup & Installation](./docs/SETUP_AND_INSTALLATION.md) | Complete setup guide | 1,000+ |
| [System Architecture](./docs/SYSTEM_ARCHITECTURE.md) | Architecture and design | 1,600+ |
| [Operations & Deployment](./docs/OPERATIONS_AND_DEPLOYMENT.md) | Deployment procedures | 900+ |
| [Troubleshooting & Fixes](./docs/TROUBLESHOOTING_AND_FIXES.md) | Issue resolution (45+ issues) | 2,500+ |
| [Feature Implementation](./docs/FEATURE_IMPLEMENTATION_GUIDE.md) | Feature deep-dives | 2,000+ |
| [Telegram & Reports](./docs/TELEGRAM_AND_REPORTS.md) | Telegram and reporting | 1,700+ |
| [Security & Auth](./docs/SECURITY_AND_AUTH.md) | Security best practices | 2,400+ |

**Total Documentation**: 8 comprehensive guides, 12,500+ lines, consolidating 164 previous documentation files.

---

*For the most up-to-date information, always refer to the documentation in the `/docs` directory.*
