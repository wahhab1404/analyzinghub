# Auth Error Debugging Guide (Login & Signup)

## What Was Changed

I've updated both your login and signup flows with comprehensive diagnostic logging to identify the exact cause of production authentication failures.

### Changes Made:

1. **Enhanced Register API Route** (`/app/api/auth/register/route.ts`):
   - Added strict body validation with detailed logging
   - Logs safe Supabase environment metadata
   - Captures full error details from Supabase (message, status, code)
   - Handles both `fullName` and `name` for backward compatibility
   - Returns useful debug info on success

2. **Enhanced Login API Route** (`/app/api/auth/login/route.ts`):
   - **CRITICAL FIX:** Changed `const response` to `let response` so cookie mutations survive
   - **CRITICAL FIX:** Removed `httpOnly: options?.httpOnly ?? true` override that was breaking sessions
   - Added strict body validation
   - Logs safe Supabase environment metadata
   - Captures full error details from Supabase
   - Enhanced error logging

3. **Enhanced Register Form** (`/components/auth/RegisterForm.tsx`):
   - Logs request payload (safely, without sensitive data)
   - Logs full response details
   - Shows detailed error information

4. **Enhanced Login Form** (`/components/auth/LoginForm.tsx`):
   - Logs request payload (safely)
   - Logs full response details
   - Shows detailed error information

## How to Debug Production Issues

### Step 1: Check Your Production Logs

After deploying, try to sign up or log in to production and immediately check your hosting logs (Vercel/Netlify/etc).

Look for these log entries:

**For Signup:**
```
[Register] Supabase env: { urlHost: '...', anonLen: ..., anonPrefix: '...' }
[Register] Supabase signUpError: { message: '...', status: ..., code: '...' }
```

**For Login:**
```
[Login] Supabase env meta: { urlHost: '...', anonLen: ..., anonPrefix: '...' }
[Login] Authentication failed: { message: '...', status: ..., code: '...' }
```

### Step 2: Identify the Root Cause

Based on the logs, you'll see one of these patterns:

#### **Pattern 1: Invalid API Key / Project Mismatch**

**Logs show:**
```
message: "Invalid API key"
message: "Invalid JWT"
message: "Project not found"
```

**Root Cause:** Your production environment variables point to different Supabase projects or are mismatched.

**Fix:**
1. Go to your Supabase dashboard
2. Navigate to Settings → API
3. Copy the **Project URL** and **anon public** key
4. In your production environment (Vercel/Netlify):
   - Set `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
5. Redeploy

---

#### **Pattern 2: Captcha Required**

**Logs show:**
```
message: "captcha_required"
message: "Captcha verification failed"
code: "captcha_verification_failed"
```

**Root Cause:** Captcha protection is enabled in your production Supabase project.

**Fix Option A (Quick - Disable Captcha):**
1. Go to Supabase Dashboard → Authentication → Settings
2. Scroll to "Bot and Abuse Protection"
3. Disable captcha
4. Try signup again

**Fix Option B (Recommended - Implement Captcha):**

If you want to keep captcha enabled, you need to implement it in your UI. Let me know if you need help with this.

---

#### **Pattern 3: Password Policy**

**Logs show:**
```
message: "Password should be at least X characters"
message: "Password must contain..."
```

**Root Cause:** Your production Supabase has stricter password requirements than local.

**Fix:**
1. Go to Supabase Dashboard → Authentication → Policies
2. Check password requirements
3. Either:
   - Adjust the policy to match your needs, OR
   - Update your frontend validation to match the policy

---

#### **Pattern 4: Email Confirmation Required**

**Logs show:**
```
message: "Email confirmations are enabled"
```

**Root Cause:** Email confirmation is enabled but users aren't confirming.

**Fix:**
1. Check Supabase Dashboard → Authentication → Email Templates
2. Verify email confirmation is set up correctly
3. For testing, you can disable "Enable email confirmations" temporarily

---

#### **Pattern 5: Missing Email/Password**

**Logs show:**
```
[Register] Missing email/password { email: false, password: false, bodyKeys: [...] }
```

**Root Cause:** The frontend is sending different field names than expected.

**Fix:** Already handled - the code now accepts both `fullName` and `name`.

---

## Login-Specific Issues

If login works locally but fails in production with 401 errors, the most common causes are:

#### **Issue 1: Cookies Not Being Set (Session Persistence Failure)**

**Symptoms:**
- Login appears to succeed but immediately redirects back to login
- User is not authenticated after successful login
- No session cookie in browser

**Root Cause:**
The response object was declared as `const` instead of `let`, preventing cookie mutations from surviving.

**Fix:**
Already applied - the code now uses `let response` to ensure cookies are properly written.

---

#### **Issue 2: httpOnly Override Breaking Sessions**

**Symptoms:**
- Login succeeds but session doesn't persist
- Cookies are set but authentication state is lost

**Root Cause:**
The code was forcing `httpOnly: true` on all cookies, overriding Supabase's internal cookie settings.

**Fix:**
Already applied - removed the `?? true` default to let Supabase control httpOnly settings.

---

#### **Issue 3: Invalid Login Credentials**

**Logs show:**
```
message: "Invalid login credentials"
code: "invalid_credentials"
```

**Root Cause:**
Either wrong password, or email confirmation is required but not completed.

**Fix:**
1. Verify the user exists and password is correct
2. Check Supabase Dashboard → Authentication → Users to see if email is confirmed
3. If email confirmation is required, check Supabase → Authentication → Email Templates
4. For testing, you can disable "Enable email confirmations" temporarily

---

## Quick Production Test

After deploying, open your browser console and try to sign up or log in. You'll see logs like:

**For Signup:**
```
[RegisterForm] Submitting registration: { email: "...", hasPassword: true, hasFullName: true, role: "..." }
[RegisterForm] Response: { status: 400, ok: false, result: { error: "..." } }
```

**For Login:**
```
[LoginForm] Submitting login: { email: "...", hasPassword: true }
[LoginForm] Response: { status: 401, ok: false, result: { error: "..." } }
```

The error message will tell you exactly what's wrong.

## Next Steps

1. **Deploy this updated code**
2. **Try to sign up AND log in to production**
3. **Check your hosting logs** for the `[Register]` and `[Login]` entries
4. **Share the error message with me** if you need help identifying the fix

The logs will show you exactly which pattern is causing the issue, and you can apply the specific fix.

## Production Environment Variables Checklist

Make sure these are set in your production environment:

- ✅ `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
- ✅ Both values are from the **same** Supabase project
- ✅ No typos or extra spaces
- ✅ Keys are not expired or revoked

## Common Mistakes

**For Both Login & Signup:**
1. **Using different Supabase projects** for local vs production
2. **Copying the service_role key instead of anon key** (anon key is the public one)
3. **Not redeploying** after updating environment variables
4. **Captcha enabled in production but not in local**

**Login-Specific:**
5. **Session cookies not persisting** - Already fixed with `let response` change
6. **httpOnly override breaking sessions** - Already fixed by removing default override
7. **Email confirmation required** but user hasn't confirmed email

Once you deploy and test, share the log output with me and I'll help you fix it immediately.

## Summary of Critical Fixes Applied

### Login Route Fixes:
1. ✅ Changed `const response` to `let response` for cookie persistence
2. ✅ Removed `httpOnly: options?.httpOnly ?? true` override
3. ✅ Added comprehensive error logging
4. ✅ Added environment validation and logging

### Register Route Fixes:
1. ✅ Added strict body validation
2. ✅ Added environment logging
3. ✅ Backward compatible with both `fullName` and `name`
4. ✅ Enhanced error logging

These fixes address the two most common production-only failures:
- Cookie mutations not surviving (login)
- Environment variable mismatches (both)
- httpOnly override breaking sessions (login)
