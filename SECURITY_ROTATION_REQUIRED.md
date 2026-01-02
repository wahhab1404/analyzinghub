# URGENT: Security Credential Rotation Required

**Status:** CRITICAL - Secrets were exposed in repository

**Date Detected:** 2025-12-29

## Summary

Several sensitive credentials were found hardcoded in the repository and must be rotated immediately. Netlify's secret scanning has flagged these values, and they are now considered compromised.

## Affected Secrets

The following secrets were exposed and MUST be regenerated:

1. **SUPABASE_SERVICE_ROLE_KEY** - Found in:
   - NETLIFY_ENV_SETUP.md (line 26)
   - netlify.toml (line 10)
   - supabase/functions/telegram-channel-broadcast/index.ts (line 149)

2. **TELEGRAM_BOT_TOKEN** - Found in:
   - NETLIFY_ENV_SETUP.md (line 28)

3. **SMTP_PASSWORD** - Found in:
   - NETLIFY_ENV_SETUP.md (line 34)

4. **POLYGON_API_KEY** - Found in:
   - NETLIFY_ENV_SETUP.md (line 27)

5. **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Found in:
   - NETLIFY_ENV_SETUP.md (line 25)
   - netlify.toml (line 10)

## Immediate Actions Required

### 1. Rotate Supabase Service Role Key

**CRITICAL - This key has full database access**

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project: `gbdzhdlpbwrnhykmstic`
3. Navigate to **Settings** → **API**
4. Under "Service role key", click **Reset**
5. Copy the new service role key
6. Update Netlify environment variables:
   - Go to: https://app.netlify.com/sites/anlzhub/configuration/env
   - Find `SUPABASE_SERVICE_ROLE_KEY`
   - Click **Edit** → Paste new value → **Save**
7. Update your local `.env` file with the new key
8. Trigger a new deployment on Netlify

### 2. Regenerate Telegram Bot Token

1. Open Telegram and message **@BotFather**
2. Send command: `/mybots`
3. Select your bot
4. Select **API Token** → **Revoke current token**
5. Click **Yes, I'm sure**
6. BotFather will provide a new token
7. Update Netlify environment variables:
   - Variable: `TELEGRAM_BOT_TOKEN`
   - New value: (paste new token from BotFather)
8. Update your local `.env` file
9. Reconfigure webhook with new token (run setup script)

### 3. Rotate SMTP Password

**For ZeptoMail:**

1. Log in to your ZeptoMail dashboard
2. Navigate to **Settings** → **SMTP**
3. Delete the old API key
4. Generate a new API key
5. Update Netlify environment variables:
   - Variable: `SMTP_PASSWORD`
   - New value: (paste new API key)
6. Update your local `.env` file

### 4. Regenerate Polygon.io API Key

1. Log in to: https://polygon.io/dashboard
2. Navigate to **API Keys**
3. Delete or revoke the compromised key: `jKbMRYMKztcbYVZylExoLutnJXeMlexe`
4. Generate a new API key
5. Update Netlify environment variables:
   - Variable: `POLYGON_API_KEY`
   - New value: (paste new API key)
6. Update your local `.env` file

### 5. Regenerate TELEGRAM_WEBHOOK_SECRET

Generate a new secure random string:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Update in:
- Netlify environment variables (`TELEGRAM_WEBHOOK_SECRET`)
- Local `.env` file

### 6. Optional: Rotate Supabase Anon Key

While the anon key is meant to be public, consider rotating it for extra security:

1. Supabase Dashboard → Settings → API
2. Under "anon public key", click **Reset**
3. Update both:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Netlify
   - Local `.env` file

## Verification Steps

After rotating all secrets:

1. **Test Netlify Deployment**
   ```
   Visit: https://anlzhub.com/api/debug/env-check
   ```
   Ensure all variables are loaded correctly

2. **Test Supabase Connection**
   - Try logging in to your application
   - Create a test analysis
   - Verify database operations work

3. **Test Telegram Integration**
   - Send a test message to your bot
   - Verify webhook is receiving updates
   - Test broadcast functionality

4. **Test Email Functionality**
   - Trigger an OTP email
   - Verify SMTP connection works

5. **Test Polygon API**
   - Load stock prices in the application
   - Verify API requests succeed

6. **Trigger New Build**
   - After all secrets are rotated
   - Push a trivial commit or trigger manual deploy
   - Verify build succeeds without secret scanning errors

## Security Best Practices Going Forward

1. **Never commit secrets to git**
   - Keep all secrets in `.env` (already in `.gitignore`)
   - Use placeholders in documentation

2. **Store secrets only in secure locations:**
   - Local development: `.env` file (not committed)
   - Production: Netlify Dashboard → Environment Variables
   - Never in: code files, netlify.toml, or markdown docs

3. **Use environment variable references in code:**
   ```typescript
   // Good
   const token = process.env.TELEGRAM_BOT_TOKEN;
   if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

   // Bad - never hardcode
   const token = "8311641714:AAEHICOt6JMscx0o2BFYkoiCwqQwKht6cag";
   ```

4. **Regular rotation schedule:**
   - Service role keys: Every 90 days
   - API keys: Every 6 months
   - Bot tokens: Only when compromised
   - Webhook secrets: Every 6 months

5. **Monitor for leaks:**
   - Enable Netlify secret scanning
   - Use git-secrets or similar tools locally
   - Review commits before pushing

## Deployment Checklist

- [ ] Rotated SUPABASE_SERVICE_ROLE_KEY
- [ ] Rotated TELEGRAM_BOT_TOKEN
- [ ] Rotated SMTP_PASSWORD (ZeptoMail)
- [ ] Rotated POLYGON_API_KEY
- [ ] Regenerated TELEGRAM_WEBHOOK_SECRET
- [ ] Updated all keys in Netlify Dashboard
- [ ] Updated all keys in local `.env`
- [ ] Reconfigured Telegram webhook
- [ ] Tested all integrations
- [ ] Triggered new deployment
- [ ] Verified build passes without scanning errors
- [ ] Removed this file from repository after completion

## Support

If you encounter issues during rotation:

1. Check Netlify build logs for specific errors
2. Verify environment variables are set in correct scope (Production)
3. Ensure no typos in variable names
4. Confirm new credentials work in local `.env` first

## Cleanup

After successfully rotating all secrets and verifying the application works:

1. Delete this file from the repository
2. Commit the deletion
3. Document completion date in your security log

---

**Created:** 2025-12-29
**Priority:** P0 - Critical
**Must Complete By:** Within 24 hours
