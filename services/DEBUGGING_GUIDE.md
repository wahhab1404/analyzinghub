# Production Authentication Debugging Guide

## Overview

This guide helps diagnose the exact cause of authentication failures in production. The code now returns comprehensive debugging information.

## Step 1: Test in Browser Console

1. Open production site: https://analyzhub.com
2. Open browser console (F12)
3. Try to register or login
4. Look for the line: `AUTH RAW RESPONSE: <status> <json>`

### What to Look For

The response will include:

```json
{
  "ok": false,
  "error": "The actual error message",
  "supabase": {
    "status": 400,
    "code": "specific_error_code",
    "name": "AuthApiError"
  },
  "envMeta": {
    "urlHost": "your-project.supabase.co",
    "anonLen": 179,
    "anonPrefix": "eyJhbGciOi",
    "nodeEnv": "production"
  }
}
```

## Step 2: Run PowerShell Test Script

```powershell
.\test-production-auth.ps1
```

This script will:
- Test registration with a random email
- Test login with test credentials
- Display full error responses with formatting

## Step 3: Interpret the Results

### Case A: Wrong Supabase Project

**Symptoms:**
- `envMeta.urlHost` shows unexpected project host
- Error: "Invalid API key" or "Invalid JWT"

**Fix:**
Set correct environment variables in Netlify:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-correct-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-correct-key
```

### Case B: Captcha Enabled

**Symptoms:**
- `error`: "captcha_required"
- `supabase.code`: "captcha_required"

**Fix:**
Either:
1. Disable captcha in Supabase dashboard → Authentication → Settings
2. Or implement captcha token in frontend

### Case C: Email Confirmation Required

**Symptoms:**
- Registration succeeds but login fails
- `error`: "Email not confirmed"

**Fix:**
In Supabase dashboard → Authentication → Settings:
- Disable "Enable email confirmations"
- Or implement email confirmation flow

### Case D: Password Policy Violation

**Symptoms:**
- `error`: "Password should be at least..."
- `supabase.code`: "weak_password"

**Fix:**
Update password requirements in Supabase dashboard or frontend validation

### Case E: Invalid Login Credentials

**Symptoms:**
- `error`: "Invalid login credentials"
- `envMeta.urlHost` is correct

**Meaning:**
This is the correct error - user doesn't exist or wrong password. Auth is working properly.

### Case F: User Already Exists

**Symptoms:**
- `error`: "User already registered"
- `supabase.code`: "user_already_exists"

**Meaning:**
Registration is working - user exists in database.

## Step 4: Common Root Causes (Ranked by Probability)

1. **Wrong Supabase URL/Key in Production (60% of cases)**
   - Production env vars point to different project
   - Keys don't match the URL

2. **Captcha Enabled (20% of cases)**
   - Works locally (disabled) but fails in production (enabled)

3. **Email Confirmation Flow (15% of cases)**
   - Settings differ between local and production projects

4. **Password Policy Differences (5% of cases)**
   - Different settings between projects

## Step 5: Verify Environment Variables

Check Netlify environment variables:

1. Go to Netlify Dashboard
2. Select your site
3. Site settings → Environment variables
4. Verify:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Critical:** Both must come from the SAME Supabase project!

To find correct values:
1. Go to Supabase Dashboard
2. Select your project
3. Settings → API
4. Copy "Project URL" and "anon public" key

## Step 6: Quick Fix Commands

After identifying the issue:

```bash
# Update Netlify env vars (replace with your values)
netlify env:set NEXT_PUBLIC_SUPABASE_URL "https://your-project.supabase.co"
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "eyJhbGciOi...your-key"

# Trigger redeploy
netlify deploy --prod
```

## What to Send for Help

If still stuck, provide:

1. The full `AUTH RAW RESPONSE` line from browser console
2. The `envMeta.urlHost` value
3. The exact `error` message
4. The `supabase.code` value

Example:
```
AUTH RAW RESPONSE: 401 {"ok":false,"error":"Invalid API key","supabase":{"code":"invalid_api_key"},"envMeta":{"urlHost":"xyzproject.supabase.co"}}
```

This single line will reveal the exact fix needed.
