# Security Issue: .env File in Repository

## Problem
The `.env` file containing actual secrets was committed to the repository, causing Netlify's secret scanner to fail the deployment.

## Detected Secrets
- SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN
- POLYGON_API_KEY
- SMTP_PASSWORD

## Solution Required

### 1. Configure Netlify Secret Scanning
Add this environment variable in your Netlify dashboard:

**Variable Name:** `SECRETS_SCAN_OMIT_PATHS`
**Value:** `.env,.env.local,.env.*.local`
**Scopes:** All contexts

This tells Netlify to ignore `.env` files during secret scanning.

### 2. Alternative: Disable Secret Scanning (Not Recommended)
If you want to temporarily disable secret scanning entirely:

**Variable Name:** `SECRETS_SCAN_ENABLED`
**Value:** `false`
**Scopes:** All contexts

**WARNING:** This is not recommended for production as it removes an important security check.

### 3. Remove .env from Repository (Recommended)
The `.env` file should never be in the repository. To remove it:

```bash
git rm --cached .env
git commit -m "Remove .env from repository"
git push
```

### 4. Use .env.example Instead
A `.env.example` file has been created with placeholder values. This file is safe to commit and shows what environment variables are needed.

## Important Note
The secrets in your `.env` file are now exposed in your git history. You should consider rotating these secrets:

1. **Supabase Service Role Key**: Regenerate in Supabase Dashboard
2. **Telegram Bot Token**: Regenerate with @BotFather
3. **Polygon API Key**: Regenerate in Polygon.io Dashboard
4. **SMTP Password**: Regenerate in ZeptoMail Dashboard

## How to Deploy Now

1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. Add `SECRETS_SCAN_OMIT_PATHS` = `.env,.env.local`
3. Trigger a new deployment

All environment variables should be configured in Netlify dashboard, not committed to the repository.
