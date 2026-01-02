# Production 500 Errors Fix - Complete

## Issues Identified

1. **Netlify environment variables in `netlify.toml` only available at BUILD time, not RUNTIME**
2. **All secrets exposed in Git repository via `netlify.toml`**
3. **Missing runtime environment variables for Netlify Functions (API routes)**

---

## Changes Made

### 1. Cleaned Up `netlify.toml`
- Removed ALL secrets and sensitive environment variables
- Kept only public variables needed at build time:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Enhanced Service Role Client (`lib/supabase/server.ts`)
- Added comprehensive logging for debugging
- Checks both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
- Provides clear error messages with setup instructions
- Lists available environment variables when debugging

### 3. Enhanced Stock Price API (`app/api/stock-price/route.ts`)
- Added detailed logging for environment variable checks
- Improved error messages with setup instructions
- Logs which environment variables are available

### 4. Created Setup Documentation
- **`NETLIFY_RUNTIME_ENV_SETUP.md`**: Complete guide for configuring Netlify environment variables
- Step-by-step instructions for rotating all exposed secrets
- Security best practices

---

## Action Required: Configure Netlify Environment Variables

### CRITICAL: Complete These Steps Immediately

#### Step 1: Access Netlify Dashboard
1. Go to https://app.netlify.com/
2. Select site: **anlzhub.com**
3. Navigate to: **Site configuration → Environment variables**

#### Step 2: Add Required Environment Variables

Copy these to Netlify Dashboard (one by one):

```
SUPABASE_SERVICE_ROLE_KEY = [ROTATE - GET NEW KEY FROM SUPABASE]
POLYGON_API_KEY = [YOUR_POLYGON_API_KEY]
TELEGRAM_BOT_TOKEN = [ROTATE - GET NEW TOKEN]
TELEGRAM_WEBHOOK_SECRET = [GENERATE NEW SECRET]
SMTP_HOST = smtp.zeptomail.com
SMTP_PORT = 587
SMTP_USER = emailapikey
SMTP_PASSWORD = [ROTATE - GET NEW PASSWORD]
SMTP_FROM_EMAIL = noreply@anlzhub.com
SMTP_FROM_NAME = AnalyzingHub
APP_BASE_URL = https://anlzhub.com
```

**Set Scope to:** `All scopes` or `Production`

#### Step 3: Rotate All Exposed Secrets

##### Supabase Service Role Key
1. Go to https://supabase.com/dashboard/project/gbdzhdlpbwrnhykmstic/settings/api
2. Find **Service Role Key**
3. Click **Reset** → Generate new key
4. Copy new key → Add to Netlify as `SUPABASE_SERVICE_ROLE_KEY`

##### Telegram Bot Token
1. Open Telegram → Message @BotFather
2. Send `/revoke` → Select your bot
3. Send `/token` → Get new token
4. Copy new token → Add to Netlify as `TELEGRAM_BOT_TOKEN`

##### SMTP Password
1. Log in to https://www.zoho.com/zeptomail/
2. Delete existing mail agent
3. Create new mail agent
4. Copy new password → Add to Netlify as `SMTP_PASSWORD`

##### Webhook Secret
```bash
# Generate new secret
openssl rand -hex 32
```
Add to Netlify as `TELEGRAM_WEBHOOK_SECRET`

#### Step 4: Deploy
1. In Netlify Dashboard → **Deploys**
2. Click **Trigger deploy → Clear cache and deploy site**

#### Step 5: Verify
After deployment completes, test:

**Check Environment Variables:**
```bash
curl https://anlzhub.com/api/debug/env-check
```

Expected response:
```json
{
  "ok": true,
  "missingCount": 0,
  "message": "All environment variables are configured correctly"
}
```

**Test Stock Price API:**
```bash
curl https://anlzhub.com/api/stock-price?symbol=AAPL
```

Expected: Valid stock quote with price data

**Test in Dashboard:**
1. Log in to https://anlzhub.com
2. Create a new analysis
3. Verify Telegram broadcast works

---

## Why This Fix Works

### Build vs Runtime Environment Variables

**Netlify's Environment Variable Behavior:**

| Location | Build Time | Runtime (Functions) |
|----------|-----------|---------------------|
| `netlify.toml` `[build.environment]` | ✅ Available | ❌ NOT Available |
| Netlify Dashboard Environment Variables | ✅ Available | ✅ Available |

**The Problem:**
- API routes run as Netlify Functions at RUNTIME
- Variables in `netlify.toml` under `[build.environment]` are ONLY for build time
- Functions can't access them during execution

**The Solution:**
- Set all environment variables in Netlify Dashboard
- They're injected into function execution environment
- Available in `process.env` at runtime

---

## Error Message Improvements

### Before (Unhelpful 500 Errors)
```
Internal Server Error
```

### After (Clear Diagnostic Messages)

**Stock Price API:**
```json
{
  "ok": false,
  "error": "MISSING_POLYGON_API_KEY",
  "details": {
    "hint": "Configure POLYGON_API_KEY in Netlify Dashboard → Site configuration → Environment variables",
    "nodeEnv": "production"
  }
}
```

**Service Role Client:**
```
[ServiceRoleClient] SUPABASE_SERVICE_ROLE_KEY missing. Available env vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
Error: Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please configure it in Netlify Dashboard → Site configuration → Environment variables
```

---

## Security Improvements

### Before
- Service role key exposed in Git
- Telegram bot token exposed in Git
- SMTP password exposed in Git
- All secrets in plain text in `netlify.toml`

### After
- All secrets in Netlify Dashboard only
- Secrets rotated and old ones invalidated
- Clear separation: public vars in code, secrets in dashboard
- `server-only` import enforced for service role client

---

## Monitoring

After deployment, monitor:

1. **Netlify Function Logs**
   - Check for environment variable errors
   - Verify API routes execute successfully

2. **Application Features**
   - User authentication
   - Stock price fetching
   - Analysis creation
   - Telegram broadcasts
   - Email notifications

3. **Error Tracking**
   - No more "Missing Supabase environment variables" errors
   - Clear error messages if any variables missing

---

## Cleanup After Verification

Once everything works:

1. **Secure debug endpoint:**
   ```typescript
   // In app/api/debug/env-check/route.ts
   // Add authentication check or delete the endpoint
   ```

2. **Remove console.logs** (optional):
   - Service role client logging
   - Stock price API logging

3. **Update documentation:**
   - Mark this fix as complete
   - Document new deployment process

---

## Summary

The root cause was Netlify's build-time vs runtime environment variable distinction. API routes run as serverless functions and need variables configured in Netlify Dashboard, not in `netlify.toml`.

All code changes are defensive and add better error reporting. The actual fix is configuring environment variables in Netlify Dashboard and rotating exposed secrets.
