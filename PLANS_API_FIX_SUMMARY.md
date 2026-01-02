# /api/plans Production 500 Error - Fix Summary

## What Was Done

### 1. Enhanced Server-Side Logging
Added comprehensive logging to `/api/plans/route.ts`:
- Environment variable validation with details
- Request parameter logging (URL, analystId, showAll)
- Database query execution results
- Step-by-step subscriber count processing
- Detailed error objects with code, message, details, hint
- Stack traces for all exceptions

Every log message is now prefixed with `[/api/plans GET]` or `[/api/plans POST]` for easy filtering.

### 2. Improved Error Handling
- Replaced `Promise.all()` with sequential `for` loop for better error isolation
- Added URL parsing error handling
- Better handling of RPC function failures with fallback
- Returns empty array instead of 500 when no plans found
- All error responses include `details` field

### 3. Enhanced Client-Side Error Logging
Updated `components/settings/PlanManagement.tsx` to:
- Log the full HTTP status and response body
- Parse and display JSON error details
- Distinguish between HTTP errors and exceptions

### 4. Added Dynamic Route Configuration
```typescript
export const dynamic = 'force-dynamic'
```
Applied to prevent static generation issues.

### 5. Created Diagnostic Endpoint
Available at: `/api/debug/plans-test?analystId={uuid}`

## Next Steps (REQUIRED)

### Step 1: Deploy to Production
Push these changes to your production environment.

### Step 2: Check Browser Console
After deploying, open the production site and navigate to Settings > Plan Management.

In the browser console, you should now see detailed error information:
```
Failed to load plans - HTTP 500 : {"error":"...", "details":"..."}
Error details: {...}
```

### Step 3: Check Server Logs
In your production logs (Netlify/Vercel logs), search for:
```
[/api/plans GET]
```

You should see logs like:
```
[/api/plans GET] Request params: { analystId: '...', showAll: 'true', url: '...' }
[/api/plans GET] Query executed: { success: true, planCount: 0, analystId: '...', showAll: 'true' }
[/api/plans GET] No plans found, returning empty array
```

OR if there's an error:
```
[/api/plans GET] Error fetching plans: { code: '...', message: '...', details: '...', hint: '...' }
```

### Step 4: Run Diagnostic Endpoint
```bash
curl "https://anlzhub.com/api/debug/plans-test?analystId=39e2a757-8104-4166-9504-9c8c5534f56f"
```

This will return a detailed diagnostic report showing exactly what's failing.

## Most Likely Causes

Based on the symptoms, the issue is likely one of:

### 1. Environment Variables Not Set in Production
**Check:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
**Log will show:** `[/api/plans GET] Missing environment variables`

### 2. RPC Function Doesn't Exist
**Function:** `get_plan_subscriber_count`
**Log will show:** `[/api/plans GET] RPC error for plan ... : function "get_plan_subscriber_count" does not exist`
**Impact:** Should fallback to direct query (not cause 500)

### 3. Database Migration Not Applied
**Table:** `analyzer_plans`
**Log will show:** `[/api/plans GET] Error fetching plans: { code: '42P01', ... }`
**Impact:** Will return empty array (not cause 500)

### 4. URL Parsing Error (unlikely)
**Log will show:** `[/api/plans GET] URL parsing error`

### 5. Unhandled Exception in Subscriber Count
**Log will show:** `[/api/plans GET] Exception in subscriber count: ...`
**Impact:** Should gracefully set count to 0 (not cause 500)

## What The Logs Will Tell You

With the enhanced logging, you'll see EXACTLY where the failure occurs:

**If environment vars are missing:**
```
[/api/plans GET] Missing environment variables: { hasUrl: false, hasKey: false, ... }
```

**If query fails:**
```
[/api/plans GET] Error fetching plans: { code: 'PGRST...', message: '...', ... }
```

**If everything works but returns empty:**
```
[/api/plans GET] Request params: { ... }
[/api/plans GET] Query executed: { success: true, planCount: 0, ... }
[/api/plans GET] No plans found, returning empty array
```

**If subscriber count fails (but plan fetch succeeds):**
```
[/api/plans GET] Processing subscriber counts for 2 plans
[/api/plans GET] RPC error for plan abc-123: function does not exist
[/api/plans GET] Direct count error for plan abc-123: ...
[/api/plans GET] Successfully processed all plans, returning 2 plans
```

## Testing Locally First (Recommended)

Before deploying to production, test locally:

```bash
# Start dev server
npm run dev

# In another terminal, test the endpoint
curl "http://localhost:3000/api/plans?analystId=39e2a757-8104-4166-9504-9c8c5534f56f&showAll=true"

# Check console output for [/api/plans GET] logs
```

## If Issue Persists

After deploying and checking logs, if the issue persists:

1. **Copy the server logs** showing the `[/api/plans GET]` entries
2. **Copy the browser console** error output
3. **Run the diagnostic endpoint** and copy the full JSON response
4. **Check Netlify/Vercel environment variables** - verify they're set correctly

With these three pieces of information, the exact cause will be immediately clear.

## Expected Successful Flow

When working correctly, you should see:

**Server logs:**
```
[/api/plans GET] Request params: { analystId: '39e...56f', showAll: 'true', url: '...' }
[/api/plans GET] Query executed: { success: true, planCount: 0, analystId: '39e...56f', showAll: 'true' }
[/api/plans GET] No plans found, returning empty array
```

**Browser console:**
```
(No errors - or if there are plans, you'll see them loaded)
```

**Response:**
```json
{
  "plans": []
}
```

## Current Status

- All fixes applied and tested
- Build successful
- Ready to deploy
- Diagnostic endpoint created
- Documentation complete

**Action Required:** Deploy to production and check logs as outlined above.
