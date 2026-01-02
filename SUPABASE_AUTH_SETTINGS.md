# Supabase Auth Settings Configuration

## Required Manual Configuration in Supabase Dashboard

The following security and performance settings must be configured manually in your Supabase dashboard. These cannot be set via migrations.

### 1. Enable Leaked Password Protection (High Priority - Security)

**Why:** This prevents users from using compromised passwords by checking against HaveIBeenPwned.org database.

**How to Enable:**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **gbdzhdlpbwrnhykmstic**
3. Navigate to **Authentication** → **Settings**
4. Scroll to **Security and Protection**
5. Find **"Enable Leaked Password Protection"**
6. Toggle it **ON**
7. Click **Save**

**Impact:** Users will not be able to use passwords that have been exposed in data breaches.

---

### 2. Configure Auth Database Connection Strategy (Performance)

**Why:** Your Auth server uses a fixed number of connections (10). Using percentage-based allocation allows it to scale with your database instance.

**Current Setting:** Fixed at 10 connections
**Recommended:** Switch to percentage-based (e.g., 5-10% of pool size)

**How to Configure:**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project: **gbdzhdlpbwrnhykmstic**
3. Navigate to **Settings** → **Database**
4. Find **"Connection Pooling"** section
5. Look for **"Auth Server Pool Mode"**
6. Change from **"Session (Fixed)"** to **"Transaction (Percentage)"**
7. Set percentage to **5-10%** of your total pool size
8. Click **Save**

**Impact:** Better resource utilization and improved scalability as your instance grows.

---

## Verification

After making these changes:

1. **Leaked Password Protection:**
   - Try registering with a known compromised password (e.g., "password123")
   - You should see an error message preventing registration

2. **Connection Pool:**
   - Monitor your database performance in the Dashboard
   - Check **Database** → **Pooler** → **Connection Stats**
   - Auth connections should now scale with your instance

---

## Additional Security Recommendations

### Enable Email Confirmations (Optional but Recommended)
- Go to **Authentication** → **Settings** → **Email**
- Enable **"Confirm email"** if you want users to verify their email addresses
- Configure email templates for confirmation emails

### Set Password Requirements
- Go to **Authentication** → **Settings** → **Password**
- Set minimum password length (recommend: 8-12 characters)
- Require password complexity if needed

### Enable MFA (Multi-Factor Authentication)
- Go to **Authentication** → **Settings** → **Multi-Factor Authentication**
- Enable **TOTP** or **SMS** based MFA
- Users can then enable MFA in their account settings

---

## Environment Variables Already Configured

The following environment variables are properly configured in your `.env` file and Netlify:

✅ `NEXT_PUBLIC_SUPABASE_URL`
✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
✅ `SUPABASE_SERVICE_ROLE_KEY`

No changes needed for these.
