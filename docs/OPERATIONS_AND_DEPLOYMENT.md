# Operations and Deployment Guide

Complete production deployment and operations guide for AnalyzingHub platform.

**Last Updated:** February 7, 2026

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Service Deployments](#service-deployments)
5. [Environment Configuration](#environment-configuration)
6. [Edge Functions Deployment](#edge-functions-deployment)
7. [Production Checklist](#production-checklist)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Performance Optimization](#performance-optimization)
11. [Cost Optimization](#cost-optimization)
12. [Backup and Recovery](#backup-and-recovery)
13. [Security Guidelines](#security-guidelines)

---

## Prerequisites

### Required Accounts

1. **Supabase Account**
   - Project created
   - Database password saved securely
   - Region selected (closest to users)

2. **Netlify/Vercel Account**
   - For main application hosting
   - Custom domain configured (optional)

3. **Fly.io Account** (for realtime services)
   - CLI installed: `curl -L https://fly.io/install.sh | sh`
   - Authenticated: `flyctl auth login`

4. **API Keys Required**
   - Polygon.io API key (Starter plan minimum: $199/month for indices)
   - Databento API key (for live streaming, optional)
   - Telegram Bot Token (from @BotFather)
   - ZeptoMail SMTP credentials

5. **Infrastructure Services**
   - Upstash Redis account (for caching)
   - Domain name (optional but recommended)

---

## Initial Setup

### 1. Supabase Project Setup

#### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization and set project name
4. Set database password (save securely)
5. Select region closest to your users
6. Wait for project creation (2-3 minutes)

#### 1.2 Get Credentials

From Supabase Dashboard → Settings → API:

```bash
# Copy these values:
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 1.3 Configure Authentication

1. Go to **Authentication** → **Providers** → **Email**
2. Enable Email provider
3. **Disable** "Confirm email" (important for OTP login)
4. Go to **Authentication** → **URL Configuration**
5. Set **Site URL**: `https://yourdomain.com`
6. Add **Redirect URLs**:
   - `https://yourdomain.com/dashboard`
   - `https://yourdomain.com/auth/callback`

#### 1.4 Configure Storage

1. Go to **Storage**
2. Verify buckets exist:
   - `avatars` (public)
   - `chart-images` (public)
3. Buckets are created by migrations automatically

---

## Database Configuration

### Apply Migrations

All migrations are in `supabase/migrations/` folder. Apply them in chronological order.

#### Option A: Using Supabase Dashboard

1. Go to **SQL Editor** in Supabase dashboard
2. For each migration file (in order):
   - Copy the SQL content
   - Paste into SQL Editor
   - Click "Run"

#### Option B: Using Supabase CLI

```bash
# Link project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push

# Verify tables created
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'index%';"
```

### Key Tables Verified

```sql
-- Core tables
- profiles
- analyses
- subscriptions
- ratings
- notifications

-- Indices system
- indices_reference
- index_analyses
- index_trades
- analysis_updates
- trade_updates

-- Communication
- telegram_channels
- telegram_outbox
- telegram_send_log

-- Admin & System
- admin_settings
- platform_packages
- user_points_balance
- leaderboard_cache
```

### Setup Admin Settings

```sql
-- Configure Telegram bot token
INSERT INTO admin_settings (setting_key, setting_value)
VALUES ('telegram_bot_token', 'YOUR_BOT_TOKEN');

-- Verify
SELECT * FROM admin_settings;
```

---

## Service Deployments

### 1. Main Application (Netlify)

#### 1.1 Connect Repository

1. Push code to GitHub/GitLab/Bitbucket
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect Git provider
5. Select repository

#### 1.2 Build Configuration

Netlify auto-detects from `netlify.toml`:
- **Build command**: `npx next build`
- **Publish directory**: `.next`
- **Functions directory**: Auto-configured by @netlify/plugin-nextjs

#### 1.3 Deploy

1. Click "Deploy site"
2. Wait for build completion (3-5 minutes)
3. Site live at `https://your-site.netlify.app`

#### 1.4 Custom Domain (Optional)

1. Go to **Domain settings**
2. Click "Add custom domain"
3. Follow instructions to add DNS records
4. HTTPS enabled automatically via Let's Encrypt

### 2. Realtime Pricing Service (Fly.io)

For indices trading with real-time price updates.

#### 2.1 Setup Redis (Upstash)

```bash
# Create Redis database at https://console.upstash.com
# Name: indices-hub-realtime
# Region: Choose closest to Fly.io region
# Type: Regional

# Copy Redis URL format:
# redis://default:xxx@xxx.upstash.io:6379
```

#### 2.2 Deploy Service

```bash
cd realtime-pricing-service

# Install dependencies
npm install

# Test build locally
npm run build

# Initialize Fly.io app
fly launch
# App name: indices-hub-realtime
# Region: us-east (or closest to users)

# Set secrets
fly secrets set \
  POLYGON_API_KEY=your_polygon_key \
  SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  REDIS_URL=redis://default:xxx@xxx.upstash.io:6379 \
  JWT_SECRET=your_supabase_jwt_secret

# Deploy
fly deploy

# Check status
fly status

# View logs
fly logs
```

#### 2.3 Verify Health

```bash
curl https://indices-hub-realtime.fly.dev/health

# Expected response:
# {
#   "status": "ok",
#   "redis": "connected",
#   "supabase": "connected",
#   "polygon": "connected",
#   "uptime": 123,
#   "activeConnections": 0,
#   "activeSubscriptions": 0
# }
```

### 3. Alternative: Vercel Deployment

#### 3.1 Connect Repository

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import Git repository

#### 3.2 Configure Project

- **Framework Preset**: Next.js
- **Root Directory**: ./
- **Build Command**: `next build`
- **Output Directory**: Auto-detected

#### 3.3 Deploy

1. Click "Deploy"
2. Wait for deployment (2-4 minutes)
3. Site live at `https://your-project.vercel.app`

---

## Environment Configuration

### Netlify Environment Variables

Go to **Site settings** → **Environment variables**:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Polygon API (for stock/indices prices)
POLYGON_API_KEY=your_polygon_api_key

# Databento (for live streaming - optional)
DATABENTO_API_KEY=db-your-key

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_SECRET=your_random_secret_here

# App Configuration
APP_BASE_URL=https://yourdomain.com
REALTIME_SERVICE_URL=https://indices-hub-realtime.fly.dev

# Email SMTP (ZeptoMail)
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=AnalyzingHub
```

### Critical Configuration Notes

#### Build vs Runtime Variables

**IMPORTANT:** In Netlify:
- Variables in `netlify.toml` → **Build time only**
- Variables in Dashboard → **Build + Runtime**

API routes run as serverless functions and need Dashboard environment variables.

#### Security Best Practices

1. **Never commit secrets** to Git
2. **Rotate exposed keys** immediately
3. Use **Netlify Dashboard** for all secrets
4. Keep `netlify.toml` for public vars only
5. Store backups in password manager

#### Generate Secure Secrets

```bash
# Generate webhook secret
openssl rand -hex 32

# Generate JWT secret
openssl rand -base64 32
```

---

## Edge Functions Deployment

### 1. Telegram Channel Broadcast

Handles all Telegram publishing for analyses and trades.

```bash
# Deploy function
npx supabase functions deploy telegram-channel-broadcast --no-verify-jwt

# Test deployment
npm run test-real-broadcast
```

### 2. Indices Telegram Publisher

Publishes indices analyses, trades, and updates.

```bash
npx supabase functions deploy indices-telegram-publisher --no-verify-jwt
```

### 3. Indices Trade Tracker

Updates prices and auto-classifies WIN/LOSS for trades.

```bash
npx supabase functions deploy indices-trade-tracker --no-verify-jwt
```

### 4. Expired Trades Auto-Closer

Automatically closes expired option trades.

```bash
npx supabase functions deploy expired-trades-closer --no-verify-jwt
```

### 5. Generate Trade Snapshot

Creates snapshot images for Telegram messages.

```bash
npx supabase functions deploy generate-trade-snapshot --no-verify-jwt
```

### Configure Cron Jobs

Set up in Supabase Dashboard → Database → Cron Jobs:

#### Trade Tracker (Every 3 Minutes)

```sql
SELECT cron.schedule(
  'indices-trade-tracker',
  '*/3 * * * *',  -- Every 3 minutes
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/indices-trade-tracker',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

#### Expired Trades Closer (Daily at 9 PM ET)

```sql
SELECT cron.schedule(
  'expired-trades-closer',
  '0 1 * * *',  -- Daily at 01:00 UTC (9:00 PM ET)
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/expired-trades-closer',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

#### Verify Cron Status

```sql
-- Check all cron jobs
SELECT * FROM cron.job WHERE jobname LIKE '%indices%';

-- Check recent runs
SELECT * FROM cron.job_run_details
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%indices%')
ORDER BY start_time DESC
LIMIT 10;
```

---

## Production Checklist

### Pre-Deployment

- [ ] All database migrations applied
- [ ] Environment variables configured in Netlify Dashboard
- [ ] All secrets rotated (if exposed in Git)
- [ ] Admin account created
- [ ] Test analyzer account created
- [ ] Telegram bot token configured in database
- [ ] Telegram channels created and verified
- [ ] Custom domain DNS configured (optional)
- [ ] SSL certificate active (automatic with Netlify/Vercel)

### Post-Deployment

- [ ] Application accessible at production URL
- [ ] Telegram webhook configured
- [ ] Edge functions deployed and responding
- [ ] Cron jobs configured and running
- [ ] Test analysis created successfully
- [ ] Test trade created and tracking
- [ ] Telegram broadcasts working
- [ ] Email notifications working
- [ ] Real-time prices updating (if using realtime service)
- [ ] Authentication working (register, login, OTP)
- [ ] Subscriptions system functional

### Testing Checklist

#### 1. Authentication Tests

```bash
# Test user registration
# Visit: https://yourdomain.com/register
# Create account with test email

# Test login
# Visit: https://yourdomain.com/login

# Test OTP login
# Use: https://yourdomain.com/login-otp
```

#### 2. Analysis Creation

```bash
# Login as Analyzer
# Create test analysis with chart
# Verify it appears in feed
# Check Telegram channel for broadcast
```

#### 3. Subscription Tests

```bash
# Login as Trader
# Subscribe to an analyzer
# Verify subscription status
# Check notifications
```

#### 4. Trade Tracking

```bash
# Create an index trade
# Verify entry snapshot captured
# Check price updates every minute
# Monitor Telegram notifications
```

#### 5. API Health Checks

```bash
# Check environment
curl https://yourdomain.com/api/debug/env-check

# Expected: {"ok": true, "missingCount": 0}

# Check realtime service
curl https://indices-hub-realtime.fly.dev/health

# Expected: all services "connected"
```

---

## Monitoring and Maintenance

### 1. Setup Monitoring

#### Supabase Monitoring

Go to **Reports** in Supabase Dashboard:
- Database usage
- API requests
- Storage usage
- Active connections
- Query performance

#### Netlify/Vercel Monitoring

1. Monitor build logs
2. Check function logs for errors
3. Set up alerts for downtime
4. Track bandwidth usage

#### Fly.io Monitoring

```bash
# Check service status
fly status -a indices-hub-realtime

# View logs
fly logs -a indices-hub-realtime

# View dashboard
fly dashboard indices-hub-realtime
```

### 2. Health Check Endpoints

```bash
# Application health
curl https://yourdomain.com/api/health

# Realtime service health
curl https://indices-hub-realtime.fly.dev/health

# Telegram webhook status
curl https://yourdomain.com/api/telegram/status
```

### 3. Database Monitoring Queries

#### Check Active Trades

```sql
SELECT
  id,
  polygon_option_ticker,
  status,
  current_contract,
  contract_high_since,
  last_quote_at,
  NOW() - last_quote_at as seconds_since_update
FROM index_trades
WHERE status = 'active'
ORDER BY last_quote_at DESC;
```

#### Monitor Telegram Queue

```sql
SELECT
  message_type,
  status,
  priority,
  created_at,
  retry_count
FROM telegram_outbox
WHERE status != 'sent'
ORDER BY priority DESC, created_at ASC;
```

#### Check Recent Errors

```sql
SELECT
  entity_type,
  status,
  error,
  created_at
FROM telegram_send_log
WHERE status = 'error'
ORDER BY created_at DESC
LIMIT 20;
```

### 4. Regular Maintenance Tasks

#### Weekly
- Check error logs in Netlify/Vercel
- Monitor API usage and rate limits
- Review user feedback and issues
- Check database query performance
- Verify cron jobs executing

#### Monthly
- Update dependencies: `npm update`
- Review database performance
- Audit security settings
- Check storage usage
- Review and optimize costs

#### Quarterly
- Review and optimize database indexes
- Clean up unused data
- Security audit
- Performance optimization review
- Update documentation

---

## Troubleshooting

### Build Failures

#### Issue: Module Not Found

```bash
# Fix: Install dependencies
npm install
npm run build
```

#### Issue: TypeScript Errors

```bash
# Fix: Type check
npm run typecheck

# View specific errors
npx tsc --noEmit
```

#### Issue: Missing tailwindcss-rtl

```bash
# Fix: Ensure in dependencies (not devDependencies)
npm install tailwindcss-rtl --save

# Redeploy
npm run build
```

### Runtime Errors

#### Issue: 500 Errors on API Routes

**Diagnosis:**
```bash
# Check Netlify function logs
# Go to: Netlify Dashboard → Functions → View logs

# Check for missing environment variables
curl https://yourdomain.com/api/debug/env-check
```

**Solution:**
1. Verify all environment variables set in Netlify Dashboard
2. Check Supabase connection
3. Ensure service role key is valid
4. Clear cache and redeploy

#### Issue: Telegram Webhook Not Working

**Diagnosis:**
```bash
# Check webhook status
curl https://yourdomain.com/api/telegram/status

# Test webhook setup
curl -X POST https://yourdomain.com/api/telegram/setup-webhook
```

**Solution:**
1. Verify TELEGRAM_BOT_TOKEN is correct
2. Check APP_BASE_URL matches production domain
3. Re-run webhook setup
4. Check bot with @BotFather

#### Issue: Database Connection Errors

**Solution:**
1. Verify Supabase project not paused
2. Check RLS policies are correct
3. Ensure service role key is set
4. Test connection from SQL Editor

### Production API Errors

#### Issue: Missing Tables (Error 42P01)

**Error:** `relation "table_name" does not exist`

**Solution:**
1. Apply missing migrations
2. Check migration order
3. Verify migration completed successfully

```sql
-- Check applied migrations
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

#### Issue: Recommendations Returning Empty

**Cause:** New users with no interaction history

**Solution:**
- This is expected behavior
- Recommendations populate as users interact
- No action needed

### Performance Issues

#### Issue: Slow Page Loads

**Solutions:**
1. Enable caching in Netlify/Vercel
2. Optimize images (use Next.js Image component)
3. Review database queries with EXPLAIN
4. Implement pagination for large datasets
5. Use CDN for static assets

#### Issue: High Database Usage

**Solutions:**
1. Add indexes to frequently queried columns
2. Implement pagination
3. Cache frequently accessed data
4. Optimize N+1 queries
5. Use database connection pooling

```sql
-- Check slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

### Realtime Service Issues

#### Issue: SSE Connections Drop

**Cause:** Reverse proxy timeout

**Solution:**
- Fly.io: Already configured for long connections
- Behind Cloudflare: Upgrade to Pro or disable proxy

#### Issue: Polygon WebSocket Disconnects

**Cause:** Network instability

**Solution:**
- Service auto-reconnects after 5s
- Check logs: `fly logs | grep "WebSocket"`
- Contact Polygon support if persistent

#### Issue: Trades Not Updating

**Diagnosis:**
```bash
# Check Polygon connection
curl https://indices-hub-realtime.fly.dev/health

# Check Redis keys
redis-cli -u $REDIS_URL GET "trade:{tradeId}:underlying:current"

# Check Fly.io logs
fly logs -a indices-hub-realtime | grep -E "Error|Polygon"
```

---

## Performance Optimization

### 1. Database Optimization

#### Add Indexes

```sql
-- Frequently queried columns
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_trades_status ON index_trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_expiry ON index_trades(expiry);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_analyses_user_status
  ON analyses(user_id, status, created_at DESC);
```

#### Optimize Queries

```sql
-- Use EXPLAIN to analyze queries
EXPLAIN ANALYZE
SELECT * FROM analyses
WHERE status = 'published'
ORDER BY created_at DESC
LIMIT 20;

-- Add missing indexes based on results
```

#### Database Connection Pooling

Already configured in Supabase client:
```typescript
// In lib/supabase/server.ts
const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
```

### 2. API Route Optimization

#### Enable Caching

```typescript
// In API routes
export const revalidate = 60; // Cache for 60 seconds

export async function GET(request: NextRequest) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
    }
  });
}
```

#### Implement Rate Limiting

```typescript
// Use Upstash Rate Limit
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});
```

### 3. Frontend Optimization

#### Image Optimization

```typescript
// Use Next.js Image component
import Image from 'next/image';

<Image
  src={imageUrl}
  alt="Chart"
  width={800}
  height={600}
  quality={85}
  loading="lazy"
/>
```

#### Code Splitting

```typescript
// Dynamic imports for heavy components
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('@/components/Chart'), {
  loading: () => <p>Loading chart...</p>,
  ssr: false
});
```

### 4. Realtime Service Optimization

#### Reduce Polling Frequency

```typescript
// In polygon-fetcher.ts
private readonly REST_POLL_INTERVAL_MS = 10000; // 10s instead of 5s
```

#### Adjust Update Threshold

```typescript
// In persistence-service.ts
private readonly MIN_CHANGE_PERCENT = 0.5; // 0.5% instead of 0.1%
```

#### Batch Database Updates

```typescript
// Buffer and batch updates
if (this.updateBuffer.length >= 10) {
  await this.flushUpdates();
}
```

---

## Cost Optimization

### Monthly Cost Breakdown

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Supabase | Pro | $25 |
| Netlify | Pro (optional) | $19 |
| Polygon.io | Starter | $199 |
| Fly.io | 512MB, 1 CPU | $5 |
| Upstash Redis | 10k commands/day | $5 |
| ZeptoMail | Pay-as-you-go | $0-10 |
| **Total** | | **$253-273/month** |

### Cost Reduction Strategies

#### 1. Use Free Tiers

```bash
# Supabase Free Tier
- Up to 500MB database
- 2GB bandwidth
- 50k monthly active users

# Netlify Free Tier
- 100GB bandwidth
- 300 build minutes

# Fly.io Free Tier
- 3 shared-cpu-1x apps
- 160GB bandwidth
```

#### 2. Optimize API Usage

```typescript
// Cache Polygon API responses
const CACHE_DURATION = 60000; // 60 seconds
const cache = new Map();

async function getStockPrice(symbol: string) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const data = await fetchFromPolygon(symbol);
  cache.set(symbol, { data, timestamp: Date.now() });
  return data;
}
```

#### 3. Reduce Database Writes

```typescript
// Only persist significant price changes
if (Math.abs(priceChange) >= 0.5) { // 0.5%
  await updateDatabase(trade);
}
```

#### 4. Optimize Storage

```sql
-- Clean up old data
DELETE FROM telegram_send_log
WHERE created_at < NOW() - INTERVAL '30 days';

-- Vacuum tables
VACUUM ANALYZE telegram_send_log;
```

---

## Backup and Recovery

### 1. Backup Strategy

#### Database Backups

**Automatic:**
- Supabase Pro: Daily automatic backups
- Retention: 7 days (Pro), 30 days (Team)

**Manual Backups:**
```bash
# Using pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Upload to secure storage
aws s3 cp backup_*.sql s3://your-backup-bucket/
```

#### Environment Variables Backup

Store securely in:
1. Password manager (1Password, Bitwarden)
2. Encrypted file in secure location
3. Never commit to Git

#### Code Backups

- Git repository (primary)
- GitHub/GitLab automatic backups
- Local clones on team machines

### 2. Recovery Procedures

#### Database Restore

```bash
# From Supabase Dashboard
# Go to: Database → Backups
# Select backup date
# Click "Restore"

# Or using psql
psql $DATABASE_URL < backup_20260207.sql
```

#### Service Recovery

**Realtime Service Down:**
```bash
# Restart service
fly apps restart indices-hub-realtime

# Or redeploy
cd realtime-pricing-service
fly deploy
```

**Edge Functions Down:**
```bash
# Redeploy all functions
npx supabase functions deploy --all
```

### 3. Disaster Recovery Plan

#### Level 1: Service Outage (1-5 minutes)

1. Check status pages:
   - Supabase: https://status.supabase.com
   - Netlify: https://www.netlifystatus.com
   - Fly.io: https://status.flyio.net

2. Restart affected services
3. Monitor logs for errors

#### Level 2: Data Corruption (5-30 minutes)

1. Identify corrupted data
2. Restore from latest backup
3. Replay transactions if needed
4. Verify data integrity

#### Level 3: Complete Failure (30+ minutes)

1. Restore database from backup
2. Redeploy all services
3. Reconfigure environment variables
4. Test all functionality
5. Communicate with users

---

## Security Guidelines

### 1. Environment Variables Security

#### Never Commit Secrets

```bash
# Check for exposed secrets
git log --all --full-history -- netlify.toml

# If found, rotate all exposed keys
```

#### Use Netlify Dashboard

All secrets must be in:
- Netlify Dashboard → Site configuration → Environment variables
- NOT in `netlify.toml` or any Git-tracked files

#### Rotate Exposed Keys

If secrets are exposed in Git:

**Supabase Service Role Key:**
```bash
# Go to: Supabase Dashboard → Settings → API
# Click: Reset Service Role Key
# Update Netlify environment variables
```

**Telegram Bot Token:**
```bash
# Message @BotFather
# Send: /revoke
# Send: /token
# Update in Netlify and database
```

### 2. Database Security

#### Row Level Security (RLS)

```sql
-- Verify RLS enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;

-- Enable RLS
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

#### API Key Restrictions

```sql
-- Limit service role key usage
-- Only use in server-side code
-- Never expose to client
-- Check with:
grep -r "SUPABASE_SERVICE_ROLE_KEY" app/
```

### 3. API Security

#### Rate Limiting

Implement on all public endpoints:
```typescript
// Use Upstash Rate Limit
const { success } = await ratelimit.limit(ip);
if (!success) {
  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429 }
  );
}
```

#### Input Validation

```typescript
// Validate all inputs
import { z } from 'zod';

const schema = z.object({
  symbol: z.string().min(1).max(10),
  price: z.number().positive()
});

const result = schema.safeParse(input);
if (!result.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: result.error },
    { status: 400 }
  );
}
```

### 4. Monitoring Security

#### Audit Logs

```sql
-- Track admin actions
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create audit trigger
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, details)
  VALUES (NEW.user_id, TG_OP, row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### Alert on Suspicious Activity

```typescript
// Monitor failed authentication attempts
// Alert on multiple 500 errors
// Track unusual API usage patterns
```

---

## Additional Resources

### Documentation

- `/tmp/cc-agent/61697473/project/docs/README.md` - Documentation overview
- `/tmp/cc-agent/61697473/project/docs/SETUP_AND_INSTALLATION.md` - Initial setup
- `/tmp/cc-agent/61697473/project/docs/SYSTEM_ARCHITECTURE.md` - Architecture details

### Support

For deployment issues:
1. Check Netlify deployment logs
2. Review Supabase logs
3. Check browser console for client errors
4. Review API endpoint logs in Netlify Functions

### Status Pages

- Supabase: https://status.supabase.com
- Netlify: https://www.netlifystatus.com
- Fly.io: https://status.flyio.net
- Polygon.io: https://status.polygon.io
- Databento: https://status.databento.com

---

## Conclusion

This guide covers the complete deployment and operations workflow for AnalyzingHub. Follow the checklists systematically and refer to the troubleshooting section when issues arise.

For production deployments:
1. Complete all prerequisites
2. Follow deployment steps in order
3. Verify each component before proceeding
4. Use the production checklist
5. Set up monitoring immediately
6. Document any custom configurations

**Remember:** Security and reliability are paramount. Never skip security steps, always rotate exposed credentials, and maintain regular backups.

---

**Document Version:** 1.0
**Last Updated:** February 7, 2026
**Maintained By:** Development Team
