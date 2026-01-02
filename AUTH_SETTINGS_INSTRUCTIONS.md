# Auth Settings Configuration Instructions

The following security and performance settings must be configured manually in the Supabase Dashboard. These settings cannot be changed via SQL migrations.

## 1. Auth DB Connection Strategy (Performance)

**Issue**: Auth server is using a fixed connection pool (10 connections) instead of percentage-based allocation.

**Impact**: Scaling your database instance won't improve Auth server performance unless this is updated.

**Fix**:
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Settings**
3. Scroll to **Database Connection Pool**
4. Change from **Fixed** (10 connections) to **Percentage** based allocation
5. Recommended: Set to **10-15%** of total connections
6. Click **Save**

**Why this matters**: With percentage-based allocation, when you upgrade your database instance, the Auth server automatically gets more connections proportional to the total pool.

---

## 2. Leaked Password Protection (Security)

**Issue**: Password breach detection is currently disabled.

**Impact**: Users can set passwords that have been compromised in data breaches, increasing account takeover risk.

**Fix**:
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Policies**
3. Find **Password Protection** section
4. Enable **"Prevent leaked passwords"**
5. This checks passwords against the HaveIBeenPwned.org database
6. Click **Save**

**Why this matters**: This feature prevents users from setting commonly compromised passwords, significantly reducing the risk of credential stuffing attacks.

---

## Summary of Database Changes Applied

The following issues were fixed via SQL migration:

✅ **RLS Policy Performance** - Optimized admin_settings policies to use `(select auth.uid())` instead of `auth.uid()` for better performance

✅ **Duplicate Policies Removed**:
- Removed duplicate "Authenticated users can read bot token" policy on admin_settings
- Removed duplicate "Public can view analysis ratings" policy on analysis_ratings

✅ **Unused Indexes Removed**:
- idx_otp_codes_user_id
- idx_admin_settings_updated_by
- idx_analyses_post_type
- idx_channel_broadcast_log_channel_id
- idx_channel_broadcast_log_analysis_id
- idx_notification_delivery_log_notification_id
- idx_notifications_actor_id
- idx_notifications_analysis_id
- idx_notifications_comment_id
- idx_notifications_parent_comment_id
- idx_profiles_tutorial_completed

✅ **SECURITY DEFINER View Fixed** - Recreated analyzer_rating_stats view without SECURITY DEFINER property, relying on RLS policies instead

---

## Next Steps

1. Apply the Auth settings changes in the Supabase Dashboard (see sections 1 and 2 above)
2. Monitor your application performance to see improvements
3. Consider enabling additional security features in the Auth settings as needed
