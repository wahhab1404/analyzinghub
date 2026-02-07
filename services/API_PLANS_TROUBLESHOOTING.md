# /api/plans Endpoint - Production Troubleshooting Guide

## Issue
The `/api/plans` endpoint is returning 500 errors in production but works in preview/development.

## Fixes Applied

### 1. Enhanced Error Logging
Added detailed logging throughout the endpoint to identify exactly where failures occur:

- `[/api/plans GET]` and `[/api/plans POST]` prefixes for all logs
- Detailed error objects with code, message, details, and hints
- Stack traces for unhandled exceptions
- Environment variable validation with length checks

### 2. Improved Error Handling
- Better handling of RPC function errors with fallback
- Graceful degradation when subscriber counts fail
- Proper error responses instead of crashes
- All errors now return structured JSON with details

### 3. Added Dynamic Route Configuration
```typescript
export const dynamic = 'force-dynamic'
```
This prevents Next.js from trying to statically generate API routes.

## Diagnostic Endpoint

A test endpoint has been created at `/api/debug/plans-test?analystId=YOUR_ID` that will:

1. Check environment variables
2. Test database connection
3. Test the plans query
4. Test the RPC function `get_plan_subscriber_count`
5. Test the fallback subscription count query
6. Return detailed diagnostics

### Usage:
```bash
curl "https://your-domain.com/api/debug/plans-test?analystId=39e2a757-8104-4166-9504-9c8c5534f56f"
```

## Common Causes & Solutions

### 1. Missing Environment Variables
**Symptom:** Error: "Server configuration error"
**Solution:** Verify in production:
- `NEXT_PUBLIC_SUPABASE_URL` is set
- `SUPABASE_SERVICE_ROLE_KEY` is set (server-only, not client)

**Check in production console:**
```
[/api/plans GET] Missing environment variables: { hasUrl: false, hasKey: true, ... }
```

### 2. RPC Function Missing or Failing
**Symptom:** Logs show "RPC error, falling back"
**Cause:** The `get_plan_subscriber_count` function doesn't exist or has permission issues

**Migration file:**
```sql
-- Should exist from: 20251228072349_fix_security_and_performance_issues.sql
CREATE FUNCTION public.get_plan_subscriber_count(p_plan_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM public.subscriptions
  WHERE plan_id = p_plan_id
  AND status IN ('active', 'trialing');
$$;
```

**Solution:** Run the migration or recreate the function.

### 3. Subscriptions Table Access Issues
**Symptom:** Both RPC and direct count fail
**Cause:** Service role key doesn't have proper permissions (unlikely) or table doesn't exist

**Solution:** Verify the `subscriptions` table exists:
```sql
SELECT * FROM public.subscriptions LIMIT 1;
```

### 4. Invalid UUID Format
**Symptom:** Error about invalid UUID
**Cause:** analystId parameter is not a valid UUID

**Solution:** Frontend should validate UUID format before calling:
```typescript
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!uuidRegex.test(analystId)) {
  // Handle invalid ID
}
```

### 5. Plans Query Fails
**Symptom:** Error fetching plans with specific code/message
**Cause:** Table structure mismatch or missing columns

**Expected columns:**
- `id` (uuid, primary key)
- `analyst_id` (uuid, foreign key)
- `name` (text)
- `description` (text)
- `price_cents` (integer)
- `billing_interval` (text)
- `features` (jsonb)
- `telegram_channel_id` (text, nullable)
- `max_subscribers` (integer, nullable)
- `is_active` (boolean)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## How to Debug in Production

### Step 1: Check Production Logs
Look for logs with these prefixes:
- `[/api/plans GET]`
- `[/api/plans POST]`

The logs will tell you exactly where the failure is occurring.

### Step 2: Run Diagnostic Endpoint
```bash
curl "https://anlzhub.com/api/debug/plans-test?analystId=39e2a757-8104-4166-9504-9c8c5534f56f"
```

This will return detailed information about:
- Environment configuration
- Database connectivity
- Query success/failure
- RPC function availability
- Exact error messages

### Step 3: Test Individual Components

**Test environment variables:**
```bash
curl "https://anlzhub.com/api/debug/env-check"
```

**Test database connection:**
Try a simple query through another endpoint first.

**Test the specific analyst ID:**
Make sure the analyst exists and has the correct role:
```sql
SELECT id, email, role_id FROM profiles WHERE id = '39e2a757-8104-4166-9504-9c8c5534f56f';
```

### Step 4: Check Frontend Code
Make sure the frontend is:
1. Passing a valid `analystId` parameter
2. Handling non-200 responses gracefully
3. Not making too many requests (rate limiting)
4. Using proper error handling:

```typescript
try {
  const response = await fetch(`/api/plans?analystId=${id}&showAll=true`)

  if (!response.ok) {
    const error = await response.json()
    console.error('Plans API error:', error)
    // Show user-friendly message
    return
  }

  const data = await response.json()
  // Handle success
} catch (error) {
  console.error('Network error:', error)
  // Handle network failure
}
```

## Expected Behavior

### GET /api/plans?analystId={uuid}&showAll=true
**Success Response (200):**
```json
{
  "plans": [
    {
      "id": "plan-uuid",
      "analyst_id": "analyst-uuid",
      "name": "Premium Plan",
      "description": "...",
      "price_cents": 9900,
      "billing_interval": "month",
      "is_active": true,
      "subscriberCount": 5
    }
  ]
}
```

**Error Responses:**
- `400`: Missing analystId parameter
- `500`: Server configuration error (env vars missing)
- `500`: Database query failed (with details)

### POST /api/plans
**Success Response (200):**
```json
{
  "plan": {
    "id": "new-plan-uuid",
    "analyst_id": "analyst-uuid",
    "name": "New Plan",
    ...
  }
}
```

**Error Responses:**
- `401`: Missing or invalid authorization
- `403`: User is not an Analyzer
- `400`: Missing required fields
- `500`: Failed to create plan (with details)

## Monitoring Recommendations

1. **Add Application Monitoring:**
   - Track 500 error rates
   - Alert on repeated failures
   - Monitor response times

2. **Log Analysis:**
   - Search for `[/api/plans` in logs
   - Group by error type
   - Track error frequency

3. **Health Checks:**
   - Periodically call diagnostic endpoint
   - Verify RPC function exists
   - Check database connectivity

## Quick Fix Checklist

- [ ] Environment variables are set in production
- [ ] Database migrations have been applied
- [ ] `get_plan_subscriber_count` RPC function exists
- [ ] `analyzer_plans` table has correct structure
- [ ] `subscriptions` table exists
- [ ] Service role key has correct permissions
- [ ] Frontend is passing valid analyst IDs
- [ ] Frontend handles errors gracefully
- [ ] Diagnostic endpoint returns success
- [ ] Production logs show detailed error info

## Contact & Support

If the issue persists after following this guide:
1. Run the diagnostic endpoint and save the output
2. Check production logs for the last 10 errors
3. Verify all environment variables are set correctly
4. Check that migrations have been applied to production database
