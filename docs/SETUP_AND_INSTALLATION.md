# Setup and Installation Guide

Complete guide to setting up AnalyzingHub from scratch, including all dependencies, services, and configurations.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Authentication Configuration](#authentication-configuration)
5. [Telegram Bot Setup](#telegram-bot-setup)
6. [Polygon API Setup](#polygon-api-setup)
7. [Email Configuration](#email-configuration)
8. [Real-time Services Setup](#real-time-services-setup)
9. [Admin Account Creation](#admin-account-creation)
10. [Verification & Testing](#verification-testing)
11. [Common Setup Issues](#common-setup-issues)

---

## Prerequisites

### Required Software
- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Git**: Latest version
- **Modern browser**: Chrome, Firefox, or Safari

### Required Services
- **Supabase Account**: Free tier available at [supabase.com](https://supabase.com)
- **Telegram Bot**: Created via [@BotFather](https://t.me/BotFather)
- **Polygon.io Account**: Free tier or paid ([polygon.io](https://polygon.io))
- **Email Service**: ZeptoMail or similar SMTP provider (optional)

### Development Environment
```bash
# Verify Node.js version
node --version  # Should be 18.x or higher

# Verify npm version
npm --version   # Should be 9.x or higher
```

---

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd analyzinghub
npm install
```

### 2. Environment Variables

Create `.env` file in project root:

```bash
cp .env.example .env
```

Edit `.env` with the following variables:

```env
# ===========================================
# SUPABASE
# ===========================================
# Get these from: Supabase Dashboard > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# ===========================================
# APPLICATION
# ===========================================
# Your domain (for webhooks and redirects)
# Development: http://localhost:3000
# Production: https://yourdomain.com
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000

# ===========================================
# TELEGRAM BOT
# ===========================================
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Generate a random secret (32+ characters)
# Example: openssl rand -hex 32
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret_here

# ===========================================
# POLYGON.IO API
# ===========================================
# Get from: https://polygon.io/dashboard/api-keys
POLYGON_API_KEY=your_polygon_api_key_here

# ===========================================
# EMAIL (OPTIONAL - for reports)
# ===========================================
# ZeptoMail SMTP credentials
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=AnalyzingHub

# ===========================================
# REAL-TIME SERVICES (OPTIONAL)
# ===========================================
# Databento API key (for Indices Hub)
DATABENTO_API_KEY=your_databento_key_here

# Redis connection (Upstash)
REDIS_URL=redis://default:password@host:port

# Real-time service URL (after deployment)
NEXT_PUBLIC_REALTIME_SERVICE_URL=https://your-service.fly.dev
```

### 3. Environment Variable Descriptions

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Public anon key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Service role key (server-side ONLY) |
| `NEXT_PUBLIC_APP_BASE_URL` | ✅ Yes | Your app's public URL |
| `TELEGRAM_BOT_TOKEN` | ⚠️ Recommended | Telegram bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | ⚠️ Recommended | Random secret for webhook validation |
| `POLYGON_API_KEY` | ⚠️ Recommended | Polygon.io API key for market data |
| `SMTP_*` | ⭕ Optional | Email delivery for reports |
| `DATABENTO_API_KEY` | ⭕ Optional | Real-time market data (Indices Hub) |
| `REDIS_URL` | ⭕ Optional | Redis for caching (Indices Hub) |

**SECURITY WARNING**:
- **NEVER** expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code
- **NEVER** commit `.env` to version control
- Add `.env` to `.gitignore` (already configured)

---

## Database Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization or create new one
4. Enter project details:
   - **Name**: analyzinghub (or your preferred name)
   - **Database Password**: Strong password (save this!)
   - **Region**: Closest to your users
5. Click "Create new project" (takes ~2 minutes)

### 2. Apply Database Migrations

**Method 1: Via Supabase Dashboard (Recommended)**

1. Go to: Supabase Dashboard > SQL Editor
2. Apply migrations in chronological order from `supabase/migrations/`

Start with these core migrations:
```sql
-- 1. Core schema (run first)
20251219215739_create_analyzinghub_schema.sql

-- 2. Admin setup
20251219215806_seed_roles_and_admin.sql
20251219220114_create_admin_user_function.sql

-- 3. Authentication fixes
20251219225902_fix_trigger_and_add_anon_policy.sql

-- 4. Continue with remaining migrations in order...
```

**Method 2: Via Supabase CLI (Advanced)**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### 3. Verify Database Setup

Run this query in SQL Editor to verify:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should return 30+ tables including:
-- profiles, roles, analyses, subscriptions, etc.

-- Check roles are seeded
SELECT * FROM roles;
-- Should return: SuperAdmin, Analyzer, Trader

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'profiles';
-- rowsecurity should be TRUE
```

---

## Authentication Configuration

### Supabase Auth Settings

**CRITICAL CONFIGURATION** - Follow these steps exactly:

1. Go to: Supabase Dashboard > Authentication > Settings

2. **Disable Email Confirmation** (required for OTP login):
   - Navigate to: **Email** section
   - Find: **Enable email confirmations**
   - **UNCHECK** this option
   - Click **Save**

3. **Configure Site URL**:
   ```
   Development: http://localhost:3000
   Production: https://yourdomain.com
   ```

4. **Add Redirect URLs**:
   ```
   http://localhost:3000/dashboard
   http://localhost:3000/auth/callback
   https://yourdomain.com/dashboard
   https://yourdomain.com/auth/callback
   ```

5. **JWT Settings** (default is fine):
   - JWT expiry: 3600 seconds (1 hour)
   - Can increase to 604800 (1 week) if preferred

6. **Security Settings**:
   - ✅ Enable rate limiting (default)
   - ✅ Enable CAPTCHA for repeated failures (optional)

### Why Disable Email Confirmation?

The platform uses **OTP (One-Time Password) login** which:
- Sends 6-digit codes to user's email
- Provides better UX for traders
- Still requires email verification (via OTP)
- Email confirmation would require double verification

If you skip this step, OTP login will fail with "Email not confirmed" error.

---

## Telegram Bot Setup

### 1. Create Bot with BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)

2. Send command: `/newbot`

3. Follow prompts:
   ```
   BotFather: Alright, a new bot. How are we going to call it?
   You: AnalyzingHub Bot

   BotFather: Good. Now let's choose a username for your bot.
   You: analyzinghub_bot (must end with 'bot')
   ```

4. BotFather will respond with your bot token:
   ```
   Done! Congratulations on your new bot.
   Token: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

5. Copy this token to your `.env` file as `TELEGRAM_BOT_TOKEN`

### 2. Configure Bot Settings

Send these commands to BotFather:

```
/setdescription @analyzinghub_bot
```
Enter: "Get real-time trading notifications and analysis updates from top market analysts."

```
/setabouttext @analyzinghub_bot
```
Enter: "AnalyzingHub connects traders with professional market analysts through real-time trade validation and performance tracking."

```
/setuserpic @analyzinghub_bot
```
Upload your bot's profile picture.

### 3. Generate Webhook Secret

Generate a secure random string for webhook validation:

```bash
# On Linux/Mac
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or online
# Visit: https://www.random.org/strings/
```

Copy the generated string to `.env` as `TELEGRAM_WEBHOOK_SECRET`

### 4. Setup Webhook (After App Deployment)

Once your app is deployed and running:

**Method 1: Using NPM Script**

```bash
npm run telegram:setup
```

**Method 2: Via API Endpoint**

Visit in browser:
```
https://yourdomain.com/api/telegram/setup-webhook-public
```

**Method 3: Manual Setup**

```bash
curl -X POST https://yourdomain.com/api/telegram/setup-webhook \
  -H "Content-Type: application/json"
```

### 5. Configure Bot Menu

Set up the bot's command menu:

```bash
npm run telegram:menu
```

This configures these commands:
- `/start` - Start the bot and link account
- `/status` - Check connection status
- `/search` - Search for symbols
- `/help` - Show help message
- `/language` - Change language preference

### 6. Verify Bot Setup

Test the bot:

```bash
# Check bot status
npm run telegram:status

# Expected output:
# ✅ Bot: analyzinghub_bot
# ✅ Username: @analyzinghub_bot
# ✅ Webhook: https://yourdomain.com/api/telegram/webhook
# ✅ Status: Active
```

---

## Polygon API Setup

### 1. Create Polygon Account

1. Visit [polygon.io](https://polygon.io)
2. Click "Sign Up"
3. Choose plan:
   - **Free Tier**: 5 API calls/minute (good for testing)
   - **Starter**: $29/month - 100 calls/minute (recommended)
   - **Developer**: $99/month - 1000 calls/minute

### 2. Get API Key

1. Go to [Dashboard](https://polygon.io/dashboard/api-keys)
2. Click "Create API Key"
3. Name it: "AnalyzingHub Production"
4. Copy the key to `.env` as `POLYGON_API_KEY`

### 3. Test API Connection

```bash
npm run test:polygon-connection

# Or manually:
curl "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=YOUR_KEY"
```

### 4. Rate Limit Considerations

The app handles rate limits gracefully:
- Caches contract data for 5 minutes
- Implements exponential backoff on 429 errors
- Falls back to cached data when unavailable

**Free Tier Limits**:
- 5 calls/minute = ~300 calls/hour
- Sufficient for: ~50 active trades
- Not recommended for: >100 active trades

**Starter Tier** ($29/month):
- 100 calls/minute = ~6000 calls/hour
- Sufficient for: ~1000 active trades
- Recommended for production

---

## Email Configuration

### Using ZeptoMail (Recommended)

1. Go to [zeptomail.zoho.com](https://zeptomail.zoho.com)
2. Sign up (500 emails/day free)
3. Verify your domain:
   - Add TXT/CNAME records to DNS
   - Wait for verification (~1 hour)
4. Create mail agent:
   - Name: "AnalyzingHub"
   - Generate SMTP credentials
5. Add credentials to `.env`:
   ```env
   SMTP_HOST=smtp.zeptomail.com
   SMTP_PORT=587
   SMTP_USER=your_username
   SMTP_PASSWORD=your_password
   SMTP_FROM_EMAIL=noreply@yourdomain.com
   SMTP_FROM_NAME=AnalyzingHub
   ```

### Testing Email Delivery

```bash
npm run test:email-delivery

# Or create test report
npm run test:daily-report
```

### Alternative: Other SMTP Providers

**SendGrid**: $19.95/month for 50k emails
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your_sendgrid_api_key
```

**Mailgun**: $35/month for 50k emails
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=your_username
SMTP_PASSWORD=your_password
```

---

## Real-time Services Setup

### Indices Hub Real-time Service

The Indices Hub requires real-time market data streaming for live options prices.

### 1. Databento Account

1. Visit [databento.com](https://databento.com)
2. Sign up for account
3. Choose plan:
   - **Live Starter**: $8/month for 10 symbols
   - **Live Growth**: $50/month for 100 symbols

4. Get API key:
   - Dashboard > API Keys
   - Create new key
   - Add to `.env` as `DATABENTO_API_KEY`

### 2. Redis Setup (Upstash)

1. Visit [upstash.com](https://upstash.com)
2. Create account (free tier available)
3. Create Redis database:
   - Name: "analyzinghub-cache"
   - Region: Same as your app
   - Type: Global (or Regional)

4. Copy connection string:
   - Format: `redis://default:password@host:port`
   - Add to `.env` as `REDIS_URL`

### 3. Deploy Real-time Service

See [OPERATIONS_AND_DEPLOYMENT.md](./OPERATIONS_AND_DEPLOYMENT.md) for full deployment instructions.

Quick version:

```bash
cd databento-live-service

# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Deploy
fly deploy

# Set secrets
fly secrets set DATABENTO_API_KEY=your_key
fly secrets set SUPABASE_URL=your_url
fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
fly secrets set REDIS_URL=your_redis_url
```

---

## Admin Account Creation

### Method 1: Using Registration + SQL (Recommended)

1. Start the application:
   ```bash
   npm run dev
   ```

2. Visit: `http://localhost:3000/register`

3. Create account with:
   - **Full Name**: Admin User
   - **Email**: admin@analyzinghub.com
   - **Password**: ChangeMe@12345
   - **Role**: Analyzer (temporary)

4. Go to Supabase Dashboard > SQL Editor

5. Run this query:
   ```sql
   UPDATE profiles
   SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin')
   WHERE email = 'admin@analyzinghub.com';
   ```

6. Log out and log back in to see admin features

### Method 2: Using NPM Script

```bash
npm run create:analyzer
```

Follow the interactive prompts:
```
✨ Creating Admin Account...
Email: admin@analyzinghub.com
Password: ChangeMe@12345
Role: SuperAdmin
✅ Account created successfully!
```

### Method 3: Direct SQL (Advanced)

```sql
-- Create admin profile function
SELECT create_admin_profile(
  'auth_user_id_here',  -- Get from auth.users table
  'admin@analyzinghub.com'
);
```

### Verify Admin Access

1. Login with admin credentials
2. Navigate to: `/dashboard/admin`
3. You should see:
   - User Management
   - System Settings
   - Analytics Dashboard
   - Content Moderation

If you don't see admin features:
```sql
-- Verify role assignment
SELECT p.email, r.name as role
FROM profiles p
JOIN roles r ON p.role_id = r.id
WHERE p.email = 'admin@analyzinghub.com';

-- Should return: SuperAdmin
```

**IMPORTANT**: Change default password immediately in production!

---

## Verification & Testing

### 1. Application Health Check

```bash
# Start development server
npm run dev

# Visit health check endpoints:
# http://localhost:3000/api/debug/env-check
# Should show all env vars loaded (without exposing values)
```

Expected output:
```json
{
  "status": "ok",
  "environment": {
    "NEXT_PUBLIC_SUPABASE_URL": "✓ Set",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "✓ Set",
    "SUPABASE_SERVICE_ROLE_KEY": "✓ Set",
    "TELEGRAM_BOT_TOKEN": "✓ Set",
    "POLYGON_API_KEY": "✓ Set"
  }
}
```

### 2. Database Connection Test

```bash
npm run test:supabase-connection
```

Expected:
```
✅ Connected to Supabase
✅ Database tables: 32 found
✅ RLS enabled on all tables
✅ Roles configured: SuperAdmin, Analyzer, Trader
```

### 3. Telegram Bot Test

```bash
npm run telegram:status
```

Expected:
```
✅ Bot token valid
✅ Bot username: @analyzinghub_bot
✅ Webhook configured: https://yourdomain.com/api/telegram/webhook
✅ Webhook status: Active
```

Send `/start` to your bot in Telegram to verify it responds.

### 4. API Endpoints Test

```bash
npm run test:api-endpoints
```

Tests:
- ✅ Auth endpoints
- ✅ Analyses CRUD
- ✅ Subscriptions
- ✅ Telegram integration
- ✅ Reports generation

### 5. Build Test

```bash
npm run build
```

Should complete without errors:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                   48.7 kB         217 kB
...
```

---

## Common Setup Issues

### Issue: "Invalid Supabase URL or key"

**Symptoms**:
- Login fails with "Invalid credentials"
- API calls return 401 errors

**Solution**:
1. Verify `.env` has correct values from Supabase Dashboard
2. Check no extra spaces or quotes around values
3. Restart development server after changing `.env`
4. Clear browser cache and cookies

### Issue: "Email not confirmed" on login

**Symptoms**:
- Email/password login works but shows "Email not confirmed"
- OTP login fails

**Solution**:
1. Go to: Supabase Dashboard > Authentication > Settings
2. Find: "Enable email confirmations"
3. **Uncheck** this option
4. Click Save
5. Try login again

### Issue: Telegram webhook not receiving messages

**Symptoms**:
- Bot doesn't respond to messages
- `/start` command does nothing

**Solutions**:
1. Check `NEXT_PUBLIC_APP_BASE_URL` is correct in `.env`
2. Verify webhook is set:
   ```bash
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo
   ```
3. Re-setup webhook:
   ```bash
   npm run telegram:setup
   ```
4. Check app is publicly accessible (not just localhost)
5. Verify webhook secret matches in `.env` and code

### Issue: "Cannot find module" errors

**Symptoms**:
- Import errors during development
- TypeScript compilation fails

**Solutions**:
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

### Issue: Database migrations fail

**Symptoms**:
- Migration errors in Supabase logs
- Tables not created

**Solutions**:
1. Check migrations are applied in chronological order
2. Look for error message in Supabase Dashboard > Logs
3. Common issues:
   - Foreign key constraint violations
   - Duplicate constraint names
   - Missing dependent migrations

4. Nuclear option (development only):
   ```sql
   -- Drop all tables and start fresh
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   -- Re-apply all migrations
   ```

### Issue: Real-time prices not updating

**Symptoms**:
- Prices frozen on Indices Hub
- Last update timestamp not changing

**Solutions**:
1. Check Databento service is running:
   ```bash
   fly status -a databento-live-service
   ```
2. Check service logs:
   ```bash
   fly logs -a databento-live-service
   ```
3. Verify Redis connection:
   ```bash
   redis-cli -u $REDIS_URL ping
   # Should return: PONG
   ```
4. Check Databento API key is valid
5. Verify market is open (9:30 AM - 4:00 PM ET for options)

### Issue: Build succeeds but deployment fails

**Symptoms**:
- `npm run build` works locally
- Netlify/Vercel deployment fails

**Solutions**:
1. Check environment variables are set in hosting platform
2. Verify Node.js version in hosting matches local (18.x)
3. Check build logs for specific error
4. Common issues:
   - Missing environment variables
   - TypeScript errors in production mode
   - Memory limit exceeded (increase in settings)

### Issue: RLS policies blocking legitimate access

**Symptoms**:
- "Row-level security policy violation" errors
- Users can't access their own data

**Solutions**:
1. Check RLS policies in Supabase Dashboard > Database > Policies
2. Verify user authentication:
   ```sql
   SELECT auth.uid(); -- Should return user's UUID
   ```
3. Check role assignments:
   ```sql
   SELECT p.email, r.name
   FROM profiles p
   JOIN roles r ON p.role_id = r.id;
   ```
4. Test policy in SQL Editor:
   ```sql
   SET LOCAL role TO authenticated;
   SET LOCAL request.jwt.claims.sub TO 'user-uuid-here';
   SELECT * FROM profiles WHERE id = 'user-uuid-here';
   ```

---

## Next Steps

After successful setup:

1. **Deploy to Production**: See [OPERATIONS_AND_DEPLOYMENT.md](./OPERATIONS_AND_DEPLOYMENT.md)
2. **Configure Features**: See [FEATURE_IMPLEMENTATION_GUIDE.md](./FEATURE_IMPLEMENTATION_GUIDE.md)
3. **Setup Telegram Integration**: See [TELEGRAM_AND_REPORTS.md](./TELEGRAM_AND_REPORTS.md)
4. **Review Security**: See [SECURITY_AND_AUTH.md](./SECURITY_AND_AUTH.md)

---

## Quick Reference Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build production
npm run typecheck              # Type checking

# Database
npm run test:supabase-connection  # Test DB
npm run verify:cron               # Check cron jobs

# Telegram
npm run telegram:setup         # Setup webhook
npm run telegram:status        # Check status
npm run telegram:menu          # Configure menu

# Testing
npm run test:indices:telegram  # Test Indices Hub
npm run test:daily-report      # Test reports
npm run check:channels         # Check channels

# Maintenance
npm run update:prices          # Update prices
npm run clear:cache            # Clear cache
```

---

## Support Resources

- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Next.js Docs**: [nextjs.org/docs](https://nextjs.org/docs)
- **Telegram Bot API**: [core.telegram.org/bots/api](https://core.telegram.org/bots/api)
- **Polygon API Docs**: [polygon.io/docs](https://polygon.io/docs)
