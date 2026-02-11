# Comprehensive Troubleshooting and Fixes Guide

**Version:** 1.0
**Last Updated:** February 7, 2026
**Maintainers:** AnalyzingHub Development Team

---

## Table of Contents

1. [Authentication & Authorization Issues](#1-authentication--authorization-issues)
2. [Database & API Issues](#2-database--api-issues)
3. [Telegram Integration Issues](#3-telegram-integration-issues)
4. [Reports System Issues](#4-reports-system-issues)
5. [Indices Hub Issues](#5-indices-hub-issues)
6. [Build & Deployment Issues](#6-build--deployment-issues)
7. [UI & Frontend Issues](#7-ui--frontend-issues)
8. [Performance Issues](#8-performance-issues)
9. [Quick Reference Checklists](#9-quick-reference-checklists)

---

## 1. Authentication & Authorization Issues

### 1.1 Login Works Locally But Fails in Production (401 Errors)

**Symptoms:**
- Login succeeds locally but returns 401 Unauthorized in production
- Session doesn't persist after successful login
- User redirected back to login page immediately
- No session cookie visible in browser

**Root Causes:**
1. Cookie persistence failure due to `const response` instead of `let response`
2. httpOnly override breaking session management
3. Environment variable mismatch between local and production
4. Incorrect Supabase client initialization in route handlers

**Solutions:**

**Fix 1: Cookie Persistence (Critical)**
```typescript
// ❌ WRONG - Prevents cookie mutations
const response = NextResponse.json({ user });

// ✅ CORRECT - Allows cookie mutations
let response = NextResponse.json({ user });
```

**Fix 2: Remove httpOnly Override**
```typescript
// ❌ WRONG - Overrides Supabase cookie settings
httpOnly: options?.httpOnly ?? true

// ✅ CORRECT - Let Supabase control cookie settings
httpOnly: options?.httpOnly
```

**Fix 3: Verify Environment Variables**
```bash
# Production must have these set
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**Prevention:**
- Use `let` for all response objects that may be mutated
- Never override Supabase cookie settings unless explicitly needed
- Always verify environment variables match between local and production
- Use proper server-side client initialization

**Related Files:**
- `/app/api/auth/login/route.ts`
- `/app/api/auth/register/route.ts`
- `/lib/supabase/server.ts`

**Related Issues:**
- [1.2 Signup Works Locally But Fails in Production](#12-signup-works-locally-but-fails-in-production-400-errors)
- [6.1 Build Error: supabaseKey is Required](#61-build-error-supabasekey-is-required)

---

### 1.2 Signup Works Locally But Fails in Production (400 Errors)

**Symptoms:**
- Registration succeeds locally but returns 400 Bad Request in production
- Error messages like "captcha_required" or "Invalid API key"
- Email confirmation issues

**Root Causes:**
1. Environment variable mismatch (most common - 60% of cases)
2. Captcha enabled in production but not local (20% of cases)
3. Email confirmation settings differ (15% of cases)
4. Password policy differences (5% of cases)

**Diagnosis Steps:**

**Step 1: Check Server Logs**
Look for these log patterns:
```
[Register] Supabase env: { urlHost: '...', anonLen: ..., anonPrefix: '...' }
[Register] Supabase signUpError: { message: '...', status: ..., code: '...' }
```

**Step 2: Interpret Error Codes**

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `invalid_api_key` | Wrong Supabase project | Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `captcha_required` | Captcha enabled | Disable in Supabase Dashboard or implement captcha |
| `weak_password` | Password policy | Adjust policy or frontend validation |
| `user_already_exists` | Account exists | User should login instead |

**Solutions:**

**For Environment Mismatch:**
1. Go to Supabase Dashboard → Settings → API
2. Copy "Project URL" and "anon public" key
3. In Netlify/Vercel Dashboard:
   - Set `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
4. Redeploy

**For Captcha Issues:**
- **Option A (Quick):** Disable in Supabase Dashboard → Authentication → Settings → Bot and Abuse Protection
- **Option B (Secure):** Implement captcha in UI (recommended for production)

**For Email Confirmation:**
- Disable "Enable email confirmations" in Supabase Dashboard for testing
- Or implement proper email confirmation flow

**Prevention:**
- Use same Supabase project for local and production
- Document captcha and email settings
- Implement comprehensive error logging
- Test with production environment variables locally

**Related Files:**
- `/app/api/auth/register/route.ts`
- `/components/auth/RegisterForm.tsx`
- `AUTH_FIXES_SUMMARY.md`
- `SIGNUP_DEBUG_GUIDE.md`

---

### 1.3 "Unauthorized" Error in API Routes

**Symptoms:**
- API routes return 401 or 403 errors
- Authentication works on frontend but fails in backend
- Database queries fail with permission errors

**Root Cause:**
Using `createServerClient()` instead of `createRouteHandlerClient(request)` in Next.js route handlers, causing authentication context to be lost.

**Solution:**
```typescript
// ❌ WRONG - Doesn't properly handle request cookies
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();

// ✅ CORRECT - Properly handles authentication
import { createRouteHandlerClient } from '@/lib/api-helpers';
const supabase = createRouteHandlerClient(request);
```

**Prevention:**
- Always use `createRouteHandlerClient(request)` in route handlers
- Use `createServerClient()` only in server components
- Use `createServiceRoleClient()` when service role access is needed

**Related Files:**
- `/app/api/telegram/channel/connect/route.ts`
- `/app/api/telegram/channel/disconnect/route.ts`
- `/app/api/indices/**/route.ts`
- `INDICES_AUTH_FIX.md`
- `TELEGRAM_CHANNEL_AUTH_FIX.md`

---

### 1.4 Row Level Security (RLS) Policy Issues

**Symptoms:**
- Users can't access their own data
- "Permission denied" errors in console
- Queries return empty results despite data existing

**Root Cause:**
- Incorrect RLS policies on tables
- Missing or misconfigured policy conditions
- Policy not accounting for user roles

**Diagnosis:**
```sql
-- Check RLS policies on a table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'your_table_name';

-- Test as current user
SELECT * FROM your_table_name WHERE user_id = auth.uid();
```

**Solutions:**

**Example: Fix Analyzer Plans Access**
```sql
-- Allow users to read their own plans
CREATE POLICY "Users can view own plans"
ON analyzer_plans FOR SELECT TO authenticated
USING (analyst_id = auth.uid());

-- Allow analyzers to create plans
CREATE POLICY "Analyzers can create plans"
ON analyzer_plans FOR INSERT TO authenticated
WITH CHECK (
  analyst_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
    AND r.name IN ('Analyzer', 'SuperAdmin')
  )
);
```

**Prevention:**
- Test RLS policies with different user roles
- Use `SECURITY DEFINER` functions sparingly
- Document all policy requirements
- Create helper views for complex permission checks

**Related Files:**
- `/supabase/migrations/*_fix_security_and_performance_issues.sql`
- `AUTH_SETTINGS_INSTRUCTIONS.md`

---

### 1.5 Secret Exposure in Repository

**Symptoms:**
- Netlify secret scanner fails deployment
- Secrets detected in `.env` or config files
- Build fails with "Secrets found in repository"

**Root Cause:**
`.env` file or hardcoded secrets committed to Git repository.

**Immediate Actions:**
1. Remove secrets from repository:
```bash
git rm --cached .env
git commit -m "Remove .env from repository"
git push
```

2. Configure Netlify to ignore `.env` files:
   - Variable: `SECRETS_SCAN_OMIT_PATHS`
   - Value: `.env,.env.local,.env.*.local`

3. **CRITICAL:** Rotate all exposed secrets immediately

**Secrets to Rotate:**
1. **SUPABASE_SERVICE_ROLE_KEY** - Regenerate in Supabase Dashboard
2. **TELEGRAM_BOT_TOKEN** - Regenerate with @BotFather
3. **POLYGON_API_KEY** - Regenerate in Polygon.io Dashboard
4. **SMTP_PASSWORD** - Regenerate in ZeptoMail Dashboard

**Prevention:**
- Never commit `.env` files (add to `.gitignore`)
- Use placeholders in documentation (e.g., `<YOUR_KEY_HERE>`)
- Store secrets only in environment variable dashboards
- Use git pre-commit hooks to prevent secret commits
- Regular secret rotation (90 days for critical keys)

**Related Files:**
- `SECURITY_ISSUE_FIX.md`
- `SECURITY_FIX_SUMMARY.md`
- `.env.example`

---

## 2. Database & API Issues

### 2.1 500 Error: API Routes Failing in Production

**Symptoms:**
- API routes return 500 Internal Server Error in production
- Routes work locally but fail when deployed
- "supabaseKey is required" error in logs

**Root Causes:**
1. Environment variables not available during static generation
2. API routes being pre-rendered without runtime access
3. Service clients initialized at module level instead of runtime

**Solutions:**

**Fix 1: Add Runtime Configuration**
```typescript
// Add to all API routes that access environment variables
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
```

**Fix 2: Build-Time Detection**
```typescript
// In lib/supabase/server.ts
export function createServerClient() {
  // Detect build time
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return createDummyClient()
  }

  // Runtime initialization
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createClient(supabaseUrl, supabaseKey)
}
```

**Fix 3: Lazy Service Initialization**
```typescript
// ❌ WRONG - Module-level initialization
const supabase = createClient(process.env.SUPABASE_URL!, ...)
export class MyService {
  private supabase = supabase // Breaks at build time
}

// ✅ CORRECT - Lazy initialization
export class MyService {
  private get supabase() {
    return createServiceRoleClient() // Created at runtime
  }
}
```

**Prevention:**
- Always add `dynamic = 'force-dynamic'` to API routes
- Never access `process.env` at module level
- Use lazy initialization for service clients
- Test builds with production-like environment

**Related Files:**
- `/app/api/admin/*/route.ts`
- `/app/api/auth/*/route.ts`
- `/app/api/plans/route.ts`
- `/services/scoring/scoring.service.ts`
- `/services/telegram/telegram.service.ts`
- `500_ERROR_FIX_SUMMARY.md`
- `BUILD_ERROR_FIX.md`

---

### 2.2 Plans API Returning Empty Results

**Symptoms:**
- `/api/plans` endpoint returns empty array `{ plans: [] }`
- Frontend shows "No subscription plans found"
- Plans exist in database but don't appear in UI

**Root Cause:**
API endpoint requires `analystId` parameter but frontend doesn't provide it, causing endpoint to return empty results.

**Solution:**

**Backend Fix (Automatic User Detection):**
```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  let analystId = searchParams.get('analystId')

  const supabase = createSupabaseSSRClient()

  // ✅ Auto-detect current user if no analystId provided
  if (!analystId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ plans: [] })
    }
    analystId = user.id
  }

  // Continue with query...
}
```

**Frontend (No Changes Needed):**
```typescript
// Simple call works now
const response = await fetch('/api/plans')
```

**Benefits:**
- Secure - uses server-side session, not client-provided ID
- Simple - no need to fetch user ID first
- Backward compatible - explicit `analystId` still works

**Prevention:**
- Design APIs to use server-side session by default
- Avoid requiring client to provide user IDs
- Implement auto-detection for user-scoped endpoints

**Related Files:**
- `/app/api/plans/route.ts`
- `/components/settings/PlanManagement.tsx`
- `PLANS_LIST_FIX.md`
- `PLANS_API_FIX_SUMMARY.md`

---

### 2.3 Database Query Performance Issues

**Symptoms:**
- Slow page loads
- Timeouts on API requests
- High database CPU usage
- Queries taking >1 second

**Root Causes:**
1. Missing or unused indexes
2. Inefficient RLS policy expressions
3. N+1 query problems
4. Suboptimal connection pool settings

**Diagnosis:**
```sql
-- Find slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;

-- Check unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE 'pg_%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Solutions:**

**Fix 1: Remove Unused Indexes**
```sql
-- These were removed after analysis
DROP INDEX IF EXISTS idx_otp_codes_user_id;
DROP INDEX IF EXISTS idx_admin_settings_updated_by;
DROP INDEX IF EXISTS idx_analyses_post_type;
-- (See migration for complete list)
```

**Fix 2: Optimize RLS Policies**
```typescript
// ❌ SLOW - Calls auth.uid() multiple times
CREATE POLICY "policy_name"
ON table_name
USING (
  user_id = auth.uid() AND
  created_by = auth.uid()
);

// ✅ FAST - Single auth.uid() call
CREATE POLICY "policy_name"
ON table_name
USING (
  (SELECT auth.uid()) IN (user_id, created_by)
);
```

**Fix 3: Configure Connection Pool**
In Supabase Dashboard:
1. Authentication → Settings → Database Connection Pool
2. Change from "Fixed" (10 connections) to "Percentage"
3. Set to 10-15% of total connections

**Prevention:**
- Monitor pg_stat_statements regularly
- Remove unused indexes periodically
- Use `EXPLAIN ANALYZE` for complex queries
- Configure connection pooling based on workload

**Related Files:**
- `/supabase/migrations/*_fix_security_and_performance_issues.sql`
- `AUTH_SETTINGS_INSTRUCTIONS.md`

---

### 2.4 Price Data Not Updating

**Symptoms:**
- Stock/option prices show stale data
- "No price updates" despite market being open
- Polygon API calls failing
- Prices stuck at entry values

**Root Causes:**
1. Markets closed (most common - not a bug)
2. Cron job not running or failing
3. Polygon API rate limits exceeded
4. API key invalid or expired
5. Using wrong API endpoint

**Diagnosis:**

**Check 1: Market Hours**
```typescript
// Options only trade during Regular Trading Hours
const isMarketOpen = () => {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = et.getHours()
  const day = et.getDay()

  // Monday-Friday, 9:30 AM - 4:00 PM ET
  return day >= 1 && day <= 5 && hour >= 9 && hour < 16
}
```

**Check 2: Verify Cron Job**
```bash
# Check edge function logs
# In Supabase Dashboard → Edge Functions → indices-trade-tracker → Logs

# Look for:
# ✅ "Processing X active trades"
# ✅ "Updated trade [id] with new price"
# ❌ "Rate limit exceeded"
# ❌ "API key invalid"
```

**Check 3: Test Polygon API**
```bash
curl "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/AAPL?apiKey=YOUR_KEY"
```

**Solutions:**

**For Closed Markets:**
- This is expected behavior
- Show market status indicator in UI
- Educate users about trading hours

**For Cron Job Issues:**
```sql
-- Check if cron job exists
SELECT * FROM cron.job WHERE jobname = 'update-index-trade-prices';

-- Manually trigger update
SELECT cron.schedule('update-index-trade-prices', '* * * * *',
  $$SELECT net.http_post(...)$$
);
```

**For API Issues:**
- Verify API key is valid
- Check rate limits in Polygon dashboard
- Use snapshot endpoint for better accuracy:
```typescript
// ✅ Better - Real-time snapshot
const url = `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`

// ❌ Slower - Last trade only
const url = `/v2/last/trade/${symbol}`
```

**Prevention:**
- Display market hours prominently in UI
- Implement rate limit handling
- Use exponential backoff for API calls
- Monitor API usage and alerts

**Related Files:**
- `/services/price/providers/polygon-provider.ts`
- `/supabase/functions/indices-trade-tracker/index.ts`
- `PRICE_UPDATE_ISSUE_FIX.md`
- `WHY_PRICES_NOT_CHANGING.md`
- `CONTRACT_PRICES_AUTO_UPDATE_FIX.md`

---

## 3. Telegram Integration Issues

### 3.1 Telegram Bot Not Responding

**Symptoms:**
- Bot doesn't reply to `/start`, `/help`, or other commands
- Webhook shows as configured but no responses
- No errors in logs, bot just silent

**Root Causes:**
1. Webhook not configured or pointing to wrong URL
2. Bot token invalid or expired
3. Environment variables missing in production
4. Cached deployment serving old code

**Diagnosis:**

**Step 1: Check Webhook Status**
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://anlzhub.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0
  }
}
```

**Step 2: Test Bot Token**
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe"
```

Should return bot information. If not, token is invalid.

**Step 3: Test Webhook Endpoint**
```bash
curl -X POST "https://anlzhub.com/api/telegram/webhook" \
  -H "Content-Type: application/json" \
  -d '{"message":{"chat":{"id":123},"text":"test"}}'
```

**Solutions:**

**Fix 1: Configure Webhook**
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://anlzhub.com/api/telegram/webhook",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

**Fix 2: Verify Environment Variables**
In Netlify/Vercel Dashboard, ensure these are set:
- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Fix 3: Trigger New Deployment**
```bash
# Clear cache and redeploy
netlify deploy --prod --clear-cache

# Or commit a small change
echo "# Deploy: $(date)" >> README.md
git add README.md
git commit -m "Trigger deployment"
git push
```

**Prevention:**
- Document webhook setup in deployment checklist
- Add webhook verification to health check
- Test bot immediately after deployment
- Monitor bot response times

**Related Files:**
- `/app/api/telegram/webhook/route.ts`
- `/app/api/telegram/setup-webhook/route.ts`
- `TELEGRAM_BOT_FIX.md`
- `DEPLOYMENT_FIX_SUMMARY.md`

---

### 3.2 Telegram Broadcasts Not Sending to Subscribers

**Symptoms:**
- Analysis published successfully but not sent to Telegram
- "No Telegram channels to broadcast to" in logs
- Channels configured but broadcasts don't go through

**Root Cause:**
Code checking for boolean `verified` column that doesn't exist. Table actually has `verified_at` timestamp column.

**Solution:**
```typescript
// ❌ WRONG - Column doesn't exist
.eq('verified', true)

// ✅ CORRECT - Check timestamp is not null
.not('verified_at', 'is', null)
```

**Complete Fix:**
```typescript
// Get plan-specific channels
const { data: planChannels } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, linked_plan_id')
  .eq('user_id', user.id)
  .in('linked_plan_id', body.planIds)
  .eq('enabled', true)
  .not('verified_at', 'is', null)  // ✅ Fixed

// Get platform default channel
const { data: defaultChannel } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, audience_type, is_platform_default')
  .eq('user_id', user.id)
  .eq('audience_type', analysis.visibility)
  .eq('is_platform_default', true)
  .eq('enabled', true)
  .not('verified_at', 'is', null)  // ✅ Fixed
  .maybeSingle()
```

**Verification Checklist:**
```sql
-- Check channel configuration
SELECT
  id,
  user_id,
  channel_name,
  audience_type,
  enabled,
  notify_new_analysis,
  is_platform_default,
  linked_plan_id,
  verified_at
FROM telegram_channels
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC;
```

Ensure:
- ✅ `enabled = true`
- ✅ `notify_new_analysis = true`
- ✅ `verified_at IS NOT NULL`
- ✅ `audience_type` matches analysis visibility
- ✅ Either `is_platform_default = true` OR `linked_plan_id` is set

**Prevention:**
- Check database schema before writing queries
- Use TypeScript types that match database structure
- Add database integration tests
- Document column names and types

**Related Files:**
- `/app/api/analyses/route.ts`
- `/app/api/telegram/channel/broadcast-new-analysis/route.ts`
- `/supabase/functions/telegram-channel-broadcast/index.ts`
- `TELEGRAM_BROADCAST_FIX.md`
- `BROADCAST_FIX_COMPLETE.md`

---

### 3.3 "You Already Have a Channel Connected" Error

**Symptoms:**
- Error when trying to connect Telegram channel
- Message: "You already have a public channel connected"
- Can't add new channels even though limit not reached

**Root Cause:**
System allows only one channel per audience type (public, followers, subscribers). Maximum 3 channels total.

**Solution:**

**Disconnect Existing Channel First:**
1. Go to Settings → Telegram Channel Broadcasting
2. Find the channel with same audience type
3. Click "Disconnect"
4. Now connect new channel

**Or Use Different Audience Type:**
- Public Channel → For all followers
- Followers Channel → For followers only
- Subscribers Channel → For subscribers only

**Channel System Rules:**
```
Maximum channels: 3
- 1 × Public channel
- 1 × Followers channel
- 1 × Subscribers channel
```

**Verification:**
```sql
-- Check your connected channels
SELECT
  channel_name,
  audience_type,
  is_platform_default,
  linked_plan_id,
  created_at
FROM telegram_channels
WHERE user_id = auth.uid()
ORDER BY audience_type;
```

**Prevention:**
- Display connected channels clearly in UI
- Show which audience types are available
- Add "(Already Connected)" label to disabled options
- Document 3-channel limit prominently

**Related Files:**
- `/app/api/telegram/channel/connect/route.ts`
- `/components/settings/ChannelSettings.tsx`
- `TELEGRAM_CHANNEL_AUTH_FIX.md`

---

### 3.4 Telegram Channels Not Appearing in List

**Symptoms:**
- Channel list shows empty or missing channels
- Channels exist in database but don't show in UI
- Analysis form doesn't show channel options

**Root Cause:**
Query filtering incorrectly or not joining necessary tables.

**Solutions:**

**Fix 1: Check Channel Filters**
```typescript
// Ensure query includes all necessary conditions
const { data: channels } = await supabase
  .from('telegram_channels')
  .select('*')
  .eq('user_id', userId)
  .eq('enabled', true)
  .not('verified_at', 'is', null)
  .order('created_at', { ascending: false })
```

**Fix 2: Verify Channel Display Logic**
```typescript
// In components, ensure channels are grouped correctly
const channelsByType = {
  plan: channels.filter(ch => ch.linked_plan_id),
  platform: channels.filter(ch => ch.is_platform_default)
}
```

**Database Check:**
```sql
-- Verify channels exist and are configured
SELECT
  id,
  channel_name,
  channel_id,
  audience_type,
  linked_plan_id,
  is_platform_default,
  enabled,
  verified_at,
  created_at
FROM telegram_channels
WHERE user_id = 'YOUR_USER_ID'
  AND enabled = true
  AND verified_at IS NOT NULL;
```

**Prevention:**
- Log channel query results for debugging
- Add channel count indicators in UI
- Implement comprehensive error handling
- Test with various channel configurations

**Related Files:**
- `/components/analysis/CreateAnalysisForm.tsx`
- `/app/api/telegram/channels/route.ts`
- `TELEGRAM_CHANNELS_IN_LIST_FIX.md`
- `TELEGRAM_CHANNEL_DISPLAY_FIX.md`

---

### 3.5 Telegram Invite Link Generation Fails

**Symptoms:**
- Error when generating invite links
- "Failed to create invite link" message
- Bot doesn't have administrator permissions

**Root Cause:**
Bot not added to channel as administrator or doesn't have "Invite Users" permission.

**Solution:**

**Step 1: Add Bot as Administrator**
1. Open Telegram channel
2. Go to Channel Info → Administrators
3. Add your bot (search by @botname)
4. Enable these permissions:
   - Post Messages
   - Edit Messages
   - Delete Messages
   - Invite Users via Link

**Step 2: Generate Link via API**
```typescript
// API endpoint to create invite link
const response = await fetch('/api/telegram/channel/create-invite-link', {
  method: 'POST',
  body: JSON.stringify({
    channelId: '@yourchannel',
    planId: 'plan-uuid',
  })
})
```

**Manual Link Generation:**
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/createChatInviteLink" \
  -d "chat_id=@yourchannel" \
  -d "creates_join_request=true"
```

**Prevention:**
- Document bot permissions in setup guide
- Add permission check before link generation
- Provide clear error messages
- Test invite link generation after setup

**Related Files:**
- `/app/api/telegram/channel/create-invite-link/route.ts`
- `TELEGRAM_INVITE_LINK_FIX.md`

---

## 4. Reports System Issues

### 4.1 "Access Denied" to Reports Feature

**Symptoms:**
- Analyzer accounts see "Access Denied" on reports page
- 403 Forbidden when trying to generate reports
- Reports feature only works for some users

**Root Cause:**
Frontend and backend incorrectly reading user role from API response. The role is a direct string value, not a nested object with `.name` property.

**Solution:**

**Frontend Fix:**
```typescript
// ❌ WRONG - Trying to access .name on a string
const role = data.role?.name || ''

// ✅ CORRECT - Role is direct string value
const role = data.user?.role || ''
```

**Backend Fix:**
```typescript
// ❌ WRONG - Querying non-existent role column
const { data: profile } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single();

if (profile?.role !== 'Analyzer') { ... }

// ✅ CORRECT - Join with roles table
const { data: profile } = await supabase
  .from('profiles')
  .select('role:roles(name)')
  .eq('id', user.id)
  .single();

const roleName = profile?.role?.name;
if (roleName !== 'Analyzer' && roleName !== 'SuperAdmin') { ... }
```

**Verification:**
```sql
-- Check your role
SELECT
  p.full_name,
  p.email,
  r.name as role_name
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.id = auth.uid();
```

**Prevention:**
- Use TypeScript types that match API responses
- Document API response structure
- Add role checking utilities
- Test with different user roles

**Related Files:**
- `/app/dashboard/reports/page.tsx`
- `/app/dashboard/reports/settings/page.tsx`
- `/app/api/reports/generate-period/route.ts`
- `REPORTS_ACCESS_BUG_FIX.md`
- `REPORTS_ACCESS_FIXED.md`

---

### 4.2 Reports Show "0 Trades" Despite Trades Existing

**Symptoms:**
- Generated reports display "0 trades"
- Report preview shows empty trade list
- Database has trades for the period
- Metrics show $0 profit/loss

**Root Causes:**
1. Incorrect date range filtering
2. Timezone issues causing date shifts
3. Wrong status filtering (checking `status = 'expired'` instead of expiry date)
4. Trades closed by automation not counted

**Solutions:**

**Fix 1: Date Range Calculation**
```typescript
// ✅ Correct - Use UTC timestamps
const startDate = new Date(`${dateStr}T00:00:00Z`)
const endDate = new Date(`${dateStr}T23:59:59Z`)

// ❌ Wrong - Causes timezone shifts
const startDate = new Date(dateStr)  // May shift to previous day
```

**Fix 2: Expired Trades Detection**
```typescript
// ❌ WRONG - status never equals 'expired'
const expiredTrades = allTrades.filter(t => t.status === 'expired');

// ✅ CORRECT - Filter by expiry date
const expiredTrades = allTrades.filter(t => {
  if (!t.expiry) return false;
  const expiryDate = new Date(t.expiry);
  return expiryDate >= startDate && expiryDate <= endDate;
});
```

**Fix 3: Weekend Handling**
```typescript
// When generating reports on Saturday/Sunday
function getWeekTradingDays(offset = 0) {
  const now = new Date()
  const day = now.getDay()

  // If Saturday (6) or Sunday (0), get last Friday
  const daysFromMonday = day === 0 ? 6 : (day - 1)  // ✅ Fixed Sunday calculation
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysFromMonday - (offset * 7))

  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)

  return { monday, friday }
}
```

**Verification:**
```sql
-- Check trades for specific date
SELECT
  id,
  polygon_option_ticker,
  entry_price,
  current_price,
  contract_high_since,
  max_profit,
  status,
  expiry,
  closed_at,
  created_at
FROM index_trades
WHERE DATE(expiry AT TIME ZONE 'UTC') = '2026-01-30'
   OR DATE(closed_at AT TIME ZONE 'UTC') = '2026-01-30'
ORDER BY created_at DESC;
```

**Prevention:**
- Always use UTC for date comparisons
- Test with weekend dates explicitly
- Verify timezone handling in all date functions
- Add date range validation

**Related Files:**
- `/supabase/functions/generate-period-report/index.ts`
- `/lib/market-calendar.ts`
- `REPORTS_COMPLETELY_FIXED.md`
- `DAILY_REPORT_FIX_SUMMARY.md`

---

### 4.3 Report Images Not Generating

**Symptoms:**
- Report image shows only title, no trades
- Image URL returns 404 or empty image
- Telegram posts missing report graphics
- Storage upload fails

**Root Causes:**
1. Storage bucket configured to reject `image/png` MIME type
2. Image generation function failing silently
3. Incorrect image data encoding
4. Missing trade data in image generation

**Solutions:**

**Fix 1: Update Storage Bucket**
```sql
-- Allow PNG and PDF uploads
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['text/html', 'image/png', 'application/pdf']
WHERE name = 'daily-reports';
```

**Fix 2: Verify Image Generation**
```typescript
// In generate-report-image function
const image = await generateReportImage({
  title: report.title,
  dateRange: report.date_range,
  metrics: report.summary,
  trades: report.trades.slice(0, 8)  // Top 8 trades
})

// Ensure proper encoding
const imageBuffer = Buffer.from(image, 'base64')

// Upload to storage
const { data, error } = await supabase.storage
  .from('daily-reports')
  .upload(`report-${reportId}.png`, imageBuffer, {
    contentType: 'image/png',
    upsert: true
  })
```

**Fix 3: Test Image Generation**
```bash
# Trigger image generation for existing report
curl -X POST "https://your-domain.com/api/reports/generate-image" \
  -H "Content-Type: application/json" \
  -d '{"reportId": "report-uuid"}'
```

**Verification:**
```sql
-- Check report images
SELECT
  id,
  report_date,
  image_url,
  CASE WHEN image_url IS NOT NULL THEN '✅' ELSE '❌' END as has_image,
  created_at
FROM daily_trade_reports
WHERE report_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY report_date DESC;
```

**Prevention:**
- Configure storage buckets with all needed MIME types
- Add comprehensive error logging to image generation
- Test image generation in development
- Monitor storage upload success rates

**Related Files:**
- `/supabase/functions/generate-report-image/index.ts`
- `/app/api/reports/generate/route.ts`
- `REPORT_IMAGES_FIXED.md`

---

### 4.4 Arabic Text Not Displaying in Reports

**Symptoms:**
- Arabic reports show English text
- Dual-language reports missing Arabic translations
- Arabic text appears as question marks
- RTL formatting not applied

**Root Cause:**
Missing or incomplete Arabic translations in report generation functions.

**Solution:**

**Complete Translation Map:**
```typescript
const translations = {
  en: {
    netProfit: 'Net Profit',
    totalLoss: 'Total Loss',
    winRate: 'Win Rate',
    call: 'CALL',
    put: 'PUT',
    activeStatus: 'ACTIVE',
    closedStatus: 'CLOSED',
    expiredStatus: 'EXPIRED'
  },
  ar: {
    netProfit: 'صافي الربح',
    totalLoss: 'إجمالي الخسارة',
    winRate: 'معدل النجاح',
    call: 'شراء',
    put: 'بيع',
    activeStatus: 'نشطة',
    closedStatus: 'مغلقة',
    expiredStatus: 'منتهية'
  }
}

// Apply based on language mode
const t = translations[languageMode] || translations.en
```

**Dual-Language Format:**
```typescript
// For dual language mode
const label = `${translations.en.netProfit} | ${translations.ar.netProfit}`
// Output: "Net Profit | صافي الربح"
```

**RTL Styling:**
```html
<div dir="rtl" lang="ar">
  <p class="text-right">النص العربي</p>
</div>
```

**Verification:**
Generate reports in all three modes:
1. English only
2. Arabic only
3. Dual language

**Prevention:**
- Maintain complete translation dictionaries
- Test all language modes before deployment
- Use proper RTL directives
- Document new translatable strings

**Related Files:**
- `/supabase/functions/generate-advanced-daily-report/index.ts`
- `/supabase/functions/generate-period-report/index.ts`
- `ARABIC_REPORTS_FIX_COMPLETE.md`

---

### 4.5 Report Preview Not Working

**Symptoms:**
- Clicking preview button shows nothing
- Preview modal empty or shows error
- "No HTML content available" message

**Root Cause:**
API query not including `html_content` field in SELECT statement.

**Solution:**
```typescript
// ❌ WRONG - Missing html_content
const { data: reports } = await supabase
  .from('daily_trade_reports')
  .select(`
    id,
    report_date,
    language_mode,
    status,
    file_url,
    summary
  `)

// ✅ CORRECT - Includes html_content
const { data: reports } = await supabase
  .from('daily_trade_reports')
  .select(`
    id,
    report_date,
    language_mode,
    status,
    file_url,
    summary,
    html_content  // ← Added
  `)
```

**Frontend Handling:**
```typescript
// Safely access html_content
const htmlContent = report.html_content || '<p>No content available</p>'

// Display in preview modal
<div
  dangerouslySetInnerHTML={{ __html: htmlContent }}
  className="report-preview"
/>
```

**Prevention:**
- Include all necessary fields in SELECT queries
- Add fallback content for preview
- Log when html_content is missing
- Test preview feature after generation

**Related Files:**
- `/app/api/reports/route.ts`
- `/components/reports/ReportPreview.tsx`
- `ARABIC_REPORTS_FIX_COMPLETE.md`

---

## 5. Indices Hub Issues

### 5.1 "New Trade" and "Follow-up" Buttons Not Visible

**Symptoms:**
- Analysis cards don't show action buttons
- Can view analyses but can't add trades
- Buttons visible for some users but not others

**Root Cause:**
User has "Trader" role instead of "Analyzer" role. Only Analyzers and SuperAdmins can create trades and follow-ups.

**Diagnosis:**
```sql
-- Check your role
SELECT
  p.full_name,
  p.email,
  r.name as role_name,
  CASE
    WHEN r.name IN ('Analyzer', 'SuperAdmin') THEN '✅ Can add trades'
    ELSE '❌ Cannot add trades (Trader role)'
  END as status
FROM profiles p
JOIN roles r ON r.id = p.role_id
WHERE p.id = auth.uid();
```

**Solution:**
```sql
-- Update to Analyzer role
UPDATE profiles
SET role_id = (SELECT id FROM roles WHERE name = 'Analyzer')
WHERE id = auth.uid();
```

**CRITICAL: After updating role:**
1. Log out completely
2. Clear browser cache (Ctrl+Shift+Delete)
3. Log back in
4. Refresh Indices Hub page

**Verification:**
```javascript
// Run in browser console
fetch('/api/me')
  .then(r => r.json())
  .then(data => {
    console.log('Role:', data.user?.role);
    console.log('Can create trades:',
      ['Analyzer', 'SuperAdmin'].includes(data.user?.role)
    );
  });
```

**Expected Output:**
```
Role: "Analyzer"
Can create trades: true
```

**Prevention:**
- Document role requirements in user guides
- Show role-based UI hints
- Add role change instructions in settings
- Test with different user roles

**Related Files:**
- `/components/indices/IndexAnalysisCard.tsx`
- `/components/indices/IndexAnalysesList.tsx`
- `INDICES_FEATURES_FIXED.md`
- `QUICK_FIX_CHECKLIST.md`

---

### 5.2 Contract Search Returns No Results

**Symptoms:**
- "Search Available Contracts" returns empty list
- "No contracts found" message
- Contract search dialog shows no options

**Root Causes:**
1. Polygon API rate limit exceeded (most common)
2. No contracts available for selected parameters
3. API key invalid or insufficient tier
4. Strike price range too narrow
5. Markets closed (extended hours)

**Diagnosis:**

**Check Console Logs:**
```
[PolygonService] Fetching contracts from: https://api.polygon.io/...
[PolygonService] Results count: 0
[PolygonService] Response: { status: 'ERROR', ... }
```

**Test API Directly:**
```bash
# Test contracts endpoint
curl "https://api.polygon.io/v3/reference/options/contracts?\
underlying_ticker=SPX&\
contract_type=call&\
expiration_date.gte=2026-01-10&\
expiration_date.lte=2026-01-17&\
limit=250&\
apiKey=YOUR_KEY"
```

**Solutions:**

**For Rate Limits:**
- Free tier: 5 calls/minute
- Wait 60 seconds and try again
- Consider upgrading API plan
- Implement rate limit handling in code

**For No Contracts:**
```typescript
// Expand search parameters
- Wider strike range (±10% instead of ±5%)
- Longer expiration window
- Try different expiration date
- Check if index actually has options
```

**For API Tier Issues:**
- Verify options data access in Polygon dashboard
- Check subscription includes derivatives
- Test with different symbols (SPY vs SPX)

**For Invalid Date Range:**
```typescript
// Ensure expiration is in future
const minExpiration = new Date()
minExpiration.setDate(minExpiration.getDate() + 1)  // Tomorrow

const maxExpiration = new Date()
maxExpiration.setDate(maxExpiration.getDate() + 30)  // 30 days out
```

**Prevention:**
- Show rate limit status in UI
- Implement exponential backoff
- Cache contract searches
- Provide expiration date recommendations
- Monitor API usage

**Related Files:**
- `/services/indices/options-chain.service.ts`
- `/services/indices/polygon.service.ts`
- `/app/api/indices/contracts/route.ts`
- `POLYGON_OPTIONS_FIX_SUMMARY.md`

---

### 5.3 Index Prices Showing Incorrect Values

**Symptoms:**
- SPX shows $6,831.70 instead of ~$5,950
- Index prices seem scaled incorrectly
- Values don't match market data

**Root Cause:**
System was using ETF proxies (SPY, QQQ) with 10x scaling instead of actual index data.

**Solution:**

**Use Actual Index Tickers:**
```typescript
// ❌ WRONG - ETF proxy with scaling
const symbol = 'SPY'
const indexPrice = etfPrice * 10

// ✅ CORRECT - Actual index ticker
const symbol = 'I:SPX'
const indexPrice = response.price  // No scaling needed
```

**Polygon API Format:**
```typescript
// Index ticker format
const indexTickers = {
  'SPX': 'I:SPX',     // S&P 500
  'NDX': 'I:NDX',     // Nasdaq 100
  'DJI': 'I:DJI',     // Dow Jones
  'RUT': 'I:RUT',     // Russell 2000
  'VIX': 'I:VIX'      // VIX
}

// Use aggregates endpoint for indices
const url = `/v2/aggs/ticker/I:SPX/prev`
```

**Expected Values:**
- SPX: ~$5,950 (actual S&P 500)
- NDX: ~$21,600 (actual Nasdaq 100)
- DJI: ~$42,750 (actual Dow Jones)

**Verification:**
```bash
# Test index data
curl "https://api.polygon.io/v2/aggs/ticker/I:SPX/prev?apiKey=YOUR_KEY"
```

**Prevention:**
- Use official index tickers from start
- Verify prices against external sources
- Add price sanity checks
- Document ticker formats

**Related Files:**
- `/services/indices/polygon.service.ts`
- `/components/indices/CreateIndexAnalysisForm.tsx`
- `/app/api/stock-price/route.ts`
- `INDICES_REAL_PRICE_FIX.md`

---

### 5.4 High Watermark Showing Incorrect Values

**Symptoms:**
- High watermark shows entry price instead of actual high
- Max profit calculations incorrect
- High values don't update when prices increase

**Root Cause:**
Database function `update_trade_high_watermark` was updating `max_contract_price` but not `contract_high_since`, while UI displays `contract_high_since`.

**Solution:**

**Update Database Function:**
```sql
CREATE OR REPLACE FUNCTION update_trade_high_watermark(
  p_trade_id UUID,
  p_current_price NUMERIC
)
RETURNS JSONB
AS $$
BEGIN
  -- Update BOTH fields when new high detected
  UPDATE index_trades
  SET
    max_contract_price = v_new_high,
    contract_high_since = v_new_high,  -- ← ADDED
    max_profit = v_max_profit_dollars,
    max_profit_at = NOW()
  WHERE id = p_trade_id;
END;
$$;
```

**Sync Existing Data:**
```sql
-- Update all trades to sync high watermarks
UPDATE index_trades
SET contract_high_since = COALESCE(
  max_contract_price,
  contract_high_since,
  (entry_contract_snapshot->>'mid')::NUMERIC,
  0
)
WHERE contract_high_since IS NULL
   OR contract_high_since < COALESCE(max_contract_price, 0)
   OR (max_contract_price IS NOT NULL
       AND contract_high_since != max_contract_price);
```

**Verification:**
```sql
-- Check high watermarks for active trades
SELECT
  polygon_option_ticker,
  entry_price,
  current_price,
  contract_high_since,
  max_contract_price,
  max_profit
FROM index_trades
WHERE status = 'active'
ORDER BY created_at DESC;
```

**Prevention:**
- Keep related fields in sync
- Document which field is source of truth
- Add database constraints
- Test high watermark updates regularly

**Related Files:**
- Database function: `update_trade_high_watermark`
- `/supabase/functions/indices-trade-tracker/index.ts`
- `/scripts/fix-high-watermarks-now.ts`
- `HIGH_WATERMARK_FIX_COMPLETE.md`

---

### 5.5 Prices Not Changing Outside Trading Hours

**Symptoms:**
- Contract prices stay the same for hours
- Price update timestamps refreshing but values unchanged
- User expects 24/7 updates like crypto

**Root Cause:**
This is NOT a bug - this is expected market behavior. Options contracts only trade during Regular Trading Hours (9:30 AM - 4:00 PM ET, Monday-Friday).

**Education:**

**Market Schedule:**
| Time (Eastern) | Status | Options Activity |
|----------------|--------|------------------|
| 4:00 AM - 9:30 AM | Pre-market | No options trading |
| **9:30 AM - 4:00 PM** | **Market Open** | **Active trading** |
| 4:00 PM - 8:00 PM | After-hours | No options trading |
| 8:00 PM - 4:00 AM | Closed | No options trading |
| Saturday-Sunday | Weekend | Closed |

**What Actually Happens:**
```
During Trading Hours:
  Cron job runs → Fetches new prices → Updates database ✅

Outside Trading Hours:
  Cron job runs → Fetches last price → No change (expected) ✅
```

**Solution (UX Improvement):**

Add market hours indicator:
```typescript
const MarketStatusBadge = () => {
  const isMarketOpen = checkMarketHours()

  return (
    <div className={isMarketOpen ? "bg-green-100" : "bg-yellow-100"}>
      {isMarketOpen ? (
        <>🟢 Markets Open</>
      ) : (
        <>
          🟡 Markets Closed
          <p>Prices will update when market opens (9:30 AM ET)</p>
        </>
      )}
    </div>
  )
}
```

**Prevention:**
- Display market hours prominently
- Show "last updated" timestamps
- Explain options trading hours to users
- Add market calendar reference

**Related Files:**
- `/components/indices/TradesList.tsx`
- `/components/indices/TradeMonitor.tsx`
- `/lib/market-calendar.ts`
- `WHY_PRICES_NOT_CHANGING.md`
- `ISSUES_FIXED_JAN_7.md`

---

## 6. Build & Deployment Issues

### 6.1 Build Error: supabaseKey is Required

**Symptoms:**
- Netlify build fails with "supabaseKey is required"
- Error during page data collection
- Build succeeds locally but fails in production

**Root Cause:**
Services creating Supabase clients at module level (during import) when environment variables aren't available at build time.

**Solution:**

**Change Module-Level to Lazy Initialization:**

```typescript
// ❌ WRONG - Module-level initialization
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export class ScoringService {
  private supabase = createClient(supabaseUrl, supabaseKey)
}

export const scoringService = new ScoringService()

// ✅ CORRECT - Lazy initialization
import { createServiceRoleClient } from '@/lib/supabase/server'

export class ScoringService {
  private get supabase() {
    return createServiceRoleClient()  // Created on-demand at runtime
  }
}

export const scoringService = new ScoringService()
```

**Build-Time vs Runtime:**
| Phase | Environment Variables |
|-------|-----------------------|
| Build Time | Only from `netlify.toml` `[build.environment]` |
| Runtime | From Netlify Dashboard + `netlify.toml` |

**Files to Fix:**
1. `/services/scoring/scoring.service.ts`
2. `/services/scoring/badge.service.ts`
3. `/services/telegram/telegram.service.ts`

**Prevention:**
- Never access `process.env` at module level
- Use lazy initialization for all service clients
- Test builds with `npm run build` before deploying
- Remove secrets from `netlify.toml`

**Related Files:**
- All service classes
- `/lib/supabase/server.ts`
- `BUILD_ERROR_FIX.md`

---

### 6.2 Netlify Secret Scanner Failing Deployment

**Symptoms:**
- Deployment blocked by secret scanner
- "Secrets found in repository" error
- Build logs show detected API keys

**Root Cause:**
`.env` file or hardcoded secrets committed to repository.

**Immediate Actions:**

**Step 1: Remove from Repository**
```bash
git rm --cached .env
git rm --cached netlify.toml  # If it contains secrets
git commit -m "Remove secrets from repository"
git push
```

**Step 2: Configure Secret Scanning**
In Netlify Dashboard → Environment Variables:
```bash
SECRETS_SCAN_OMIT_PATHS=.env,.env.local,.env.*.local
```

**Step 3: Rotate ALL Exposed Secrets**

**Critical Secrets to Rotate:**
1. **SUPABASE_SERVICE_ROLE_KEY**
   - Go to Supabase Dashboard → Settings → API
   - Generate new service role key
   - Update in Netlify Dashboard

2. **TELEGRAM_BOT_TOKEN**
   - Message @BotFather in Telegram
   - Send `/revoke` command
   - Create new bot or regenerate token

3. **POLYGON_API_KEY**
   - Go to Polygon.io dashboard
   - Regenerate API key
   - Update in Netlify Dashboard

4. **SMTP_PASSWORD (ZeptoMail)**
   - Go to ZeptoMail dashboard
   - Revoke old API key
   - Generate new one

**Step 4: Configure Runtime Variables**
Add ALL environment variables to Netlify Dashboard:
- Go to Site Configuration → Environment Variables
- Add each variable with new rotated values
- Set scope to "All deploy contexts"
- Trigger new deployment

**Prevention:**
- Keep `.env` in `.gitignore` (already there)
- Use `.env.example` with placeholders
- Never paste actual secrets in documentation
- Enable git pre-commit hooks
- Regular secret rotation (90 days)

**Related Files:**
- `SECURITY_ISSUE_FIX.md`
- `SECURITY_FIX_SUMMARY.md`
- `.env.example`

---

### 6.3 Edge Function Deployment Failures

**Symptoms:**
- Edge function deploys but doesn't work
- "Missing environment variables" errors
- Function logs show configuration errors

**Root Causes:**
1. Environment variables not set in Supabase Dashboard
2. Function deployed to wrong project
3. API keys invalid or expired
4. Function not linked to correct database

**Solution:**

**Set Environment Variables:**
1. Go to Supabase Dashboard → Edge Functions
2. Click on function name
3. Settings → Environment Variables
4. Add required variables:
   - `SUPABASE_URL` (auto-provided)
   - `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)
   - Custom variables as needed

**Deploy with Correct Project:**
```bash
# Link to correct project first
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
npx supabase functions deploy function-name

# Test function
npx supabase functions invoke function-name --data '{}'
```

**Verify Deployment:**
```bash
# Check function logs
npx supabase functions logs function-name --tail

# Test with curl
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/function-name" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Prevention:**
- Document required environment variables
- Use deployment scripts
- Test functions after deployment
- Monitor function logs regularly

**Related Files:**
- `/supabase/functions/*/index.ts`
- `DEPLOYMENT_FIX_SUMMARY.md`

---

### 6.4 Production vs Development Environment Differences

**Symptoms:**
- Works in development but fails in production
- Different behavior between environments
- Features missing in production

**Common Differences:**

| Aspect | Development | Production |
|--------|-------------|------------|
| Environment Variables | From `.env` file | From hosting dashboard |
| Build Process | Hot reload, no optimization | Static generation, optimized |
| API Routes | Dynamic by default | May be statically generated |
| Caching | Disabled | Aggressive |
| Error Messages | Detailed | Generic |

**Solutions:**

**Match Environments:**
1. Use same Supabase project or test with production keys locally
2. Test builds locally: `npm run build && npm start`
3. Add `dynamic = 'force-dynamic'` to API routes
4. Configure caching behavior explicitly

**Environment Variable Strategy:**
```bash
# .env.local (not committed)
NEXT_PUBLIC_SUPABASE_URL=production-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=production-key

# Test locally with production config
npm run dev
```

**Deployment Checklist:**
- [ ] All environment variables set in dashboard
- [ ] Same values as local `.env` (except dev-only vars)
- [ ] API routes have `dynamic = 'force-dynamic'`
- [ ] No hardcoded development URLs
- [ ] Edge functions deployed
- [ ] Database migrations applied

**Prevention:**
- Maintain environment variable checklist
- Use environment-specific configs
- Test with production settings locally
- Implement staging environment

**Related Files:**
- `.env.example`
- `NETLIFY_ENV_SETUP.md`
- `DEPLOYMENT_FIX_SUMMARY.md`

---

## 7. UI & Frontend Issues

### 7.1 Images Not Downloading on Mobile

**Symptoms:**
- Desktop: Right-click → Save works
- Mobile: Long press → Save fails or shows wrong image
- Downloaded image is blank or incorrect

**Root Cause:**
Mobile browsers handle image downloads differently and may have CORS or encoding issues.

**Solution:**

**Add Download Button:**
```typescript
const downloadImage = async (imageUrl: string, filename: string) => {
  try {
    const response = await fetch(imageUrl)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Download failed:', error)
    // Fallback: Open in new tab
    window.open(imageUrl, '_blank')
  }
}

// Add button in UI
<Button onClick={() => downloadImage(imageUrl, 'report.png')}>
  Download Image
</Button>
```

**CORS Configuration:**
```typescript
// In storage bucket policy
{
  "cors": [{
    "origin": ["*"],
    "method": ["GET"],
    "maxAge": 3600
  }]
}
```

**Prevention:**
- Always provide explicit download buttons
- Test on multiple mobile devices
- Add fallback download methods
- Configure proper CORS headers

**Related Files:**
- `/components/reports/ReportCard.tsx`
- `/components/indices/TradeCard.tsx`
- `MOBILE_IMAGE_DOWNLOAD_AND_TUTORIAL_FIXES.md`

---

### 7.2 Price Display Formatting Issues

**Symptoms:**
- Prices show too many decimals (e.g., $1.234567)
- Negative values not formatted consistently
- Currency symbols missing
- Large numbers not formatted with commas

**Solution:**

**Price Formatting Utility:**
```typescript
export const formatPrice = (
  value: number | null | undefined,
  options: {
    decimals?: number
    showCurrency?: boolean
    showSign?: boolean
  } = {}
): string => {
  if (value === null || value === undefined) return '-'

  const {
    decimals = 2,
    showCurrency = true,
    showSign = false
  } = options

  const formatted = Math.abs(value).toFixed(decimals)
  const withCommas = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  let result = ''

  if (showCurrency) result += '$'
  if (value < 0) result += '-'
  else if (showSign && value > 0) result += '+'

  result += withCommas

  return result
}

// Usage
formatPrice(1234.56)           // "$1,234.56"
formatPrice(-1234.56)          // "$-1,234.56"
formatPrice(1234.56, {
  showSign: true
})                             // "$+1,234.56"
```

**Percentage Formatting:**
```typescript
export const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

// Usage
formatPercent(15.5)   // "+15.50%"
formatPercent(-8.3)   // "-8.30%"
```

**Prevention:**
- Centralize formatting utilities
- Use consistent decimal places
- Test with edge cases (negative, zero, very large)
- Document formatting standards

**Related Files:**
- `/lib/formatters.ts`
- `/components/indices/TradeCard.tsx`
- `PRICE_DISPLAY_AND_PNL_FORMATTING_FIX.md`

---

### 7.3 Edit Buttons Not Visible for Own Content

**Symptoms:**
- Can't edit own analyses or trades
- Edit buttons missing from cards
- Delete options not showing

**Root Cause:**
UI checking if user is author but using incorrect field or comparison.

**Solution:**

**Proper Author Check:**
```typescript
interface TradeCardProps {
  trade: Trade
  currentUserId: string
}

const TradeCard = ({ trade, currentUserId }: TradeCardProps) => {
  const isAuthor = trade.author_id === currentUserId

  return (
    <Card>
      {/* Trade details */}

      {isAuthor && (
        <div className="flex gap-2">
          <Button onClick={() => handleEdit(trade.id)}>
            Edit
          </Button>
          <Button onClick={() => handleDelete(trade.id)} variant="destructive">
            Delete
          </Button>
        </div>
      )}
    </Card>
  )
}
```

**Get Current User:**
```typescript
// In parent component
const { data: { user } } = await supabase.auth.getUser()

// Pass to child
<TradeCard trade={trade} currentUserId={user?.id} />
```

**Prevention:**
- Always pass current user ID to components
- Use consistent field names (author_id, user_id)
- Add TypeScript types for props
- Test with multiple user accounts

**Related Files:**
- `/components/indices/TradeCard.tsx`
- `/components/analysis/AnalysisCard.tsx`
- `TRADES_EDIT_VISIBILITY_FIX.md`

---

### 7.4 Responsive Design Issues

**Symptoms:**
- Layout breaks on mobile
- Buttons off-screen
- Text overflow
- Horizontal scrolling

**Common Causes:**
1. Fixed widths instead of responsive
2. Missing mobile breakpoints
3. Overflow not handled
4. Touch targets too small

**Solutions:**

**Responsive Layout:**
```typescript
// ❌ WRONG - Fixed width
<div className="w-[800px]">

// ✅ CORRECT - Responsive width
<div className="w-full max-w-4xl mx-auto px-4">

// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Responsive Typography:**
```typescript
// Scale with screen size
<h1 className="text-2xl md:text-3xl lg:text-4xl">

// Prevent overflow
<p className="truncate">  // Single line
<p className="line-clamp-3">  // Multiple lines
```

**Mobile Touch Targets:**
```typescript
// Minimum 44x44px for touch
<button className="min-h-[44px] min-w-[44px] p-3">
```

**Testing:**
```bash
# Test various screen sizes
# Mobile: 375px, 414px
# Tablet: 768px, 1024px
# Desktop: 1280px, 1920px
```

**Prevention:**
- Design mobile-first
- Test on real devices
- Use responsive units (rem, %, vh/vw)
- Follow accessibility guidelines

---

## 8. Performance Issues

### 8.1 Slow Page Loads

**Symptoms:**
- Pages take >3 seconds to load
- Spinning loaders for extended periods
- Users report sluggish experience

**Common Causes:**
1. Too many API calls on mount
2. No data caching
3. Large bundle sizes
4. Inefficient queries
5. Missing indexes

**Diagnosis:**

**Frontend Performance:**
```bash
# Check bundle size
npm run build

# Look for large chunks
# Route (app)                                       Size     First Load JS
# ├ λ /dashboard/analyses                          1.2 MB        2.1 MB  ← Too large!
```

**Backend Performance:**
```sql
-- Check slow queries
SELECT
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Solutions:**

**1. Reduce API Calls:**
```typescript
// ❌ WRONG - Multiple separate calls
useEffect(() => {
  fetchUser()
  fetchAnalyses()
  fetchTrades()
  fetchPlans()
}, [])

// ✅ CORRECT - Single combined call
useEffect(() => {
  fetchDashboardData()  // Returns all data in one request
}, [])
```

**2. Implement Caching:**
```typescript
// React Query
const { data, isLoading } = useQuery(
  ['analyses', userId],
  fetchAnalyses,
  {
    staleTime: 5 * 60 * 1000,  // 5 minutes
    cacheTime: 10 * 60 * 1000  // 10 minutes
  }
)

// Or SWR
const { data, error } = useSWR('/api/analyses', fetcher, {
  revalidateOnFocus: false,
  revalidateOnReconnect: false
})
```

**3. Optimize Bundle Size:**
```typescript
// Dynamic imports
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Spinner />
})

// Code splitting by route
// Next.js does this automatically for pages
```

**4. Add Database Indexes:**
```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_analyses_author_created
ON analyses(author_id, created_at DESC);

CREATE INDEX idx_trades_analysis_status
ON index_trades(analysis_id, status)
WHERE status = 'active';
```

**5. Implement Pagination:**
```typescript
// Instead of fetching all records
const PAGE_SIZE = 20

const { data, fetchNextPage } = useInfiniteQuery(
  ['analyses'],
  ({ pageParam = 0 }) => fetchAnalyses(pageParam, PAGE_SIZE),
  {
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length : undefined
  }
)
```

**Prevention:**
- Monitor Core Web Vitals
- Set performance budgets
- Regular bundle analysis
- Database query monitoring
- Implement proper caching

**Related Files:**
- `/lib/api/queries.ts`
- `/components/dashboard/Dashboard.tsx`
- Database migration files

---

### 8.2 Memory Leaks and High Memory Usage

**Symptoms:**
- Browser tab becomes slow over time
- Memory usage grows continuously
- Page crashes after prolonged use

**Common Causes:**
1. Event listeners not cleaned up
2. Timers not cleared
3. Subscriptions not unsubscribed
4. Large objects held in closure
5. Infinite loops in useEffect

**Solutions:**

**Cleanup Event Listeners:**
```typescript
useEffect(() => {
  const handleResize = () => {
    setWindowWidth(window.innerWidth)
  }

  window.addEventListener('resize', handleResize)

  // ✅ Cleanup
  return () => {
    window.removeEventListener('resize', handleResize)
  }
}, [])
```

**Clear Intervals:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchPrices()
  }, 5000)

  // ✅ Cleanup
  return () => {
    clearInterval(interval)
  }
}, [])
```

**Unsubscribe from Realtime:**
```typescript
useEffect(() => {
  const subscription = supabase
    .channel('trades')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'index_trades'
    }, handleChange)
    .subscribe()

  // ✅ Cleanup
  return () => {
    subscription.unsubscribe()
  }
}, [])
```

**Fix Infinite Loops:**
```typescript
// ❌ WRONG - Infinite loop
useEffect(() => {
  setData(data.concat(newItem))
}, [data])  // Depends on data which changes every render

// ✅ CORRECT - Run once or with proper deps
useEffect(() => {
  setData(prev => prev.concat(newItem))
}, [newItem])
```

**Prevention:**
- Always return cleanup functions
- Use linters to catch missing deps
- Test components for extended periods
- Monitor memory usage in DevTools
- Use React DevTools Profiler

---

### 8.3 Database Connection Pool Exhaustion

**Symptoms:**
- "Too many connections" errors
- API requests timeout
- Database queries hang
- "Connection pool exhausted" in logs

**Root Causes:**
1. Not closing database connections
2. Connection pool too small
3. Long-running transactions
4. Connection leaks in error paths

**Solutions:**

**1. Configure Connection Pool:**
```sql
-- In Supabase Dashboard
-- Settings → Database → Connection Pooling

-- Recommended settings
Transaction Mode: Enabled
Pool Size: 15
Max Client Connections: 200
```

**2. Proper Connection Management:**
```typescript
// ✅ Use connection pooling
import { createClient } from '@supabase/supabase-js'

// Creates connection from pool
const supabase = createClient(url, key)

// Connection auto-returned to pool after request
```

**3. Avoid Long Transactions:**
```typescript
// ❌ WRONG - Holds connection too long
const client = await pool.connect()
await processLargeDataset()  // Takes minutes
await client.query('INSERT ...')
client.release()

// ✅ CORRECT - Quick transactions
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('INSERT ...')
  await client.query('COMMIT')
} finally {
  client.release()  // Always release
}
```

**4. Set Query Timeout:**
```typescript
// Prevent runaway queries
const { data, error } = await supabase
  .from('large_table')
  .select('*')
  .timeout(5000)  // 5 second timeout
```

**5. Use Auth Connection Pool:**
In Supabase Dashboard → Authentication → Settings:
- Change from "Fixed" (10 connections) to "Percentage"
- Set to 10-15% of total connections

**Monitoring:**
```sql
-- Check active connections
SELECT
  count(*) as active_connections,
  max_conn.setting as max_connections
FROM pg_stat_activity,
     pg_settings max_conn
WHERE max_conn.name = 'max_connections'
GROUP BY max_conn.setting;
```

**Prevention:**
- Use connection pooling
- Set appropriate timeouts
- Monitor connection usage
- Implement circuit breakers
- Regular database performance reviews

**Related Files:**
- `/lib/supabase/server.ts`
- `AUTH_SETTINGS_INSTRUCTIONS.md`

---

## 9. Quick Reference Checklists

### 9.1 Production Deployment Checklist

**Pre-Deployment:**
- [ ] All tests passing locally
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] Environment variables documented
- [ ] Database migrations ready
- [ ] Edge functions tested

**Environment Setup:**
- [ ] All environment variables set in hosting dashboard
- [ ] Variable scopes configured (Production/All)
- [ ] Secrets rotated if previously exposed
- [ ] API keys valid and not rate-limited

**Database:**
- [ ] Migrations applied to production
- [ ] RLS policies reviewed
- [ ] Indexes created for performance
- [ ] Backup taken before changes

**External Services:**
- [ ] Telegram webhook configured
- [ ] Polygon API key active
- [ ] Email service credentials valid
- [ ] Storage buckets configured

**Post-Deployment:**
- [ ] Health check passes
- [ ] Authentication works
- [ ] API endpoints respond correctly
- [ ] Telegram bot responds
- [ ] Reports generate successfully
- [ ] Trades update automatically
- [ ] No 500 errors in logs

**Rollback Plan:**
- [ ] Previous deployment tagged
- [ ] Database backup available
- [ ] Rollback procedure documented

---

### 9.2 Authentication Issues Quick Diagnosis

```
Symptom: Login fails with 401
├─ Check 1: Browser console shows CORS error?
│  └─ Yes → Verify NEXT_PUBLIC_SUPABASE_URL is correct
│  └─ No → Continue
│
├─ Check 2: Logs show "Invalid API key"?
│  └─ Yes → Environment variable mismatch (see Section 1.1)
│  └─ No → Continue
│
├─ Check 3: Login succeeds but session doesn't persist?
│  └─ Yes → Cookie persistence issue (see Section 1.1)
│  └─ No → Continue
│
├─ Check 4: Error mentions "captcha_required"?
│  └─ Yes → Captcha issue (see Section 1.2)
│  └─ No → Continue
│
└─ Check 5: Email confirmation required?
   └─ Yes → Configure email settings (see Section 1.2)
```

**Quick Commands:**
```bash
# Test production auth
curl -X POST "https://anlzhub.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Check environment
curl "https://anlzhub.com/api/debug/env-check"

# Verify Supabase connection
psql $DATABASE_URL -c "SELECT version();"
```

---

### 9.3 Database Issues Quick Diagnosis

```
Symptom: Query slow or failing
├─ Check 1: Query takes >1 second?
│  └─ Yes → Check for missing indexes (see Section 2.3)
│
├─ Check 2: "Permission denied" error?
│  └─ Yes → RLS policy issue (see Section 1.4)
│
├─ Check 3: Returns empty results unexpectedly?
│  └─ Yes → Check filters and RLS policies
│
└─ Check 4: "Too many connections"?
   └─ Yes → Connection pool exhaustion (see Section 8.3)
```

**Quick SQL Commands:**
```sql
-- Find slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 5;

-- Check RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public';

-- Count active connections
SELECT count(*) FROM pg_stat_activity;

-- Check table statistics
SELECT schemaname, tablename, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

---

### 9.4 Telegram Issues Quick Diagnosis

```
Symptom: Bot not responding
├─ Check 1: Webhook configured?
│  └─ Run: curl "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
│
├─ Check 2: Webhook URL correct?
│  └─ Should be: https://anlzhub.com/api/telegram/webhook
│
├─ Check 3: Bot token valid?
│  └─ Run: curl "https://api.telegram.org/bot$TOKEN/getMe"
│
├─ Check 4: Environment variables set?
│  └─ Check: TELEGRAM_BOT_TOKEN in dashboard
│
└─ Check 5: Broadcasts not sending?
   └─ Check: verified_at IS NOT NULL in telegram_channels
```

**Quick Test Commands:**
```bash
# Check webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://anlzhub.com/api/telegram/webhook"

# Delete webhook (for testing)
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Test bot token
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

---

### 9.5 Build & Deployment Issues Quick Diagnosis

```
Symptom: Build failing
├─ Check 1: "supabaseKey is required"?
│  └─ Yes → Module-level initialization (see Section 6.1)
│
├─ Check 2: "Secrets found in repository"?
│  └─ Yes → Secret exposure (see Section 6.2)
│
├─ Check 3: TypeScript errors?
│  └─ Run: npm run type-check
│
├─ Check 4: Build succeeds but 500 errors in production?
│  └─ Yes → Environment variables missing (see Section 2.1)
│
└─ Check 5: Edge function not working?
   └─ Yes → Check function logs and env vars (see Section 6.3)
```

**Quick Commands:**
```bash
# Local build test
npm run build

# Type checking
npm run type-check

# Clear cache and rebuild
rm -rf .next
npm run build

# Test production build locally
npm run build && npm start

# Check for large bundles
npm run build -- --analyze
```

---

### 9.6 Common Error Messages and Solutions

| Error Message | Most Likely Cause | Quick Fix | Section |
|---------------|-------------------|-----------|---------|
| "Invalid API key" | Environment variable mismatch | Verify Supabase URL and key match | 1.1, 1.2 |
| "supabaseKey is required" | Module-level initialization | Use lazy initialization | 6.1 |
| "Unauthorized" (401) | Wrong Supabase client in route | Use `createRouteHandlerClient(request)` | 1.3 |
| "Permission denied" | RLS policy issue | Check policies for table | 1.4 |
| "captcha_required" | Captcha enabled in production | Disable or implement captcha | 1.2 |
| "Too many connections" | Connection pool exhausted | Configure connection pooling | 8.3 |
| "No contracts found" | Rate limit or wrong params | Wait 60s or adjust search | 5.2 |
| "Webhook not found" | Telegram webhook not set | Run setWebhook command | 3.1 |
| "No plans found" | Missing analystId parameter | Backend auto-detection fix | 2.2 |
| "Access Denied" (Reports) | Incorrect role checking | Fix role query with JOIN | 4.1 |

---

## Conclusion

This comprehensive guide consolidates knowledge from 62+ troubleshooting documents into a single reference. Each issue includes:

- **Symptoms:** How to recognize the problem
- **Root Cause:** Why it happens
- **Solution:** Step-by-step fix with code examples
- **Prevention:** How to avoid in the future
- **Related Issues:** Cross-references to similar problems

**Key Takeaways:**

1. **Authentication Issues:** Most common cause is environment variable mismatch (60% of cases)
2. **Database Performance:** Remove unused indexes, optimize RLS policies, configure connection pooling
3. **Telegram Integration:** Verify webhook setup and check `verified_at IS NOT NULL`
4. **Reports System:** Use correct role queries and UTC timestamps
5. **Build Failures:** Use lazy initialization, never access env vars at module level
6. **Deployment:** Always set environment variables in hosting dashboard, not in code

**For Additional Help:**
- Check related documentation files listed in each section
- Review database schema in `/supabase/migrations/`
- Consult API route implementations in `/app/api/`
- Test with diagnostic scripts in `/scripts/`

**Version History:**
- v1.0 (2026-02-07): Initial comprehensive guide consolidating 62+ fix documents

---

**Document Index:**
- Total Issues Documented: 45+
- Total Solutions Provided: 60+
- Code Examples: 100+
- SQL Queries: 40+
- Quick Reference Sections: 6
