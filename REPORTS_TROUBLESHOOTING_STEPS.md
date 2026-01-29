# Reports System - Step-by-Step Troubleshooting

## The Problem
- Reports exist in database ✅
- Reports have trade data ✅
- But user can't see them in the UI ❌

## Debugging Steps

### Step 1: Test Debug Page

I've created a special debug page to test the API directly:

1. **Navigate to:** `http://localhost:3000/debug-reports` (or your domain)

2. **Check the output:**
   - Should show your user ID and email
   - Should show your role (e.g., "Analyzer")
   - Should show Simple Query results with count
   - Should show Full Query results with count

3. **What to look for:**
   - If `simpleQuery.count` is 0 → RLS issue or wrong user
   - If `simpleQuery.count` > 0 → Data is loading correctly
   - If `fullQuery.count` > 0 → Full API query works

### Step 2: Check Browser Console

1. Open browser DevTools (Press F12)
2. Go to the **Console** tab
3. Navigate to: `/dashboard/reports`
4. Click on the **History** tab

**Look for these messages:**
```
[Reports Page] Loading reports...
[Reports Page] Response status: 200
[Reports Page] Received data: { reportsCount: X, ... }
```

**If you see an error:**
- Note the exact error message
- Copy the full stack trace

### Step 3: Check Network Tab

1. Stay in DevTools
2. Go to **Network** tab
3. Refresh the reports page
4. Find the request to `/api/reports`
5. Click on it and check:
   - **Status:** Should be 200
   - **Response:** Should contain array of reports
   - **Preview:** Expand to see the data structure

**If Status is not 200:**
- Check the Response tab for error message
- Check the Headers tab for authentication cookies

### Step 4: Check Server Logs

If running locally with `npm run dev`:

1. Look at the terminal output
2. Find lines starting with `[Reports API]`
3. Should see:
   ```
   [Reports API] Fetching reports for user: xxx-xxx-xxx
   [Reports API] User role: Analyzer isAdmin: false
   [Reports API] Found X reports out of Y total
   ```

**If you see 0 reports found:**
- The user ID might not match
- RLS policy might be blocking access

### Step 5: Verify User ID

Run this command:
```bash
node node_modules/tsx/dist/cli.mjs scripts/test-reports-api.ts
```

This will show:
- All reports in database
- Reports for your user ID
- Whether you can access them

**Compare the author_id with your user ID!**

### Step 6: Check Authentication

1. Open DevTools → Application tab
2. Go to **Cookies**
3. Look for Supabase session cookies:
   - `sb-<project>-auth-token`
   - Should have a value (JWT token)

**If no cookies:**
- You're not logged in
- Try logging out and back in

### Step 7: Hard Reset

If nothing works, try this:

1. **Clear browser cache:**
   - Windows/Linux: Ctrl + Shift + Delete
   - Mac: Cmd + Shift + Delete
   - Check "Cookies" and "Cached files"

2. **Log out and log back in**

3. **Hard refresh the page:**
   - Windows/Linux: Ctrl + Shift + R
   - Mac: Cmd + Shift + R

4. **Try incognito/private window**

## Common Issues & Solutions

### Issue 1: "No reports yet" message
**Possible Causes:**
- Reports array is empty on frontend
- API returned empty array
- Frontend failed to parse response

**Solution:**
1. Check `/debug-reports` page
2. Check browser console for errors
3. Check network tab for API response

### Issue 2: Reports load but show "0 trades"
**This is NORMAL!**
- Daily reports only show trades from that specific day
- If no trades that day, it correctly shows 0

**Solution:**
- Generate a **Monthly** report instead
- This covers 30 days and will show more trades

### Issue 3: Loading spinner never stops
**Possible Causes:**
- API request hanging
- Network error
- CORS issue

**Solution:**
1. Check Network tab for failed requests
2. Check console for errors
3. Try refreshing the page

### Issue 4: Old data shows even after generating new report
**Possible Causes:**
- Browser caching
- Frontend state not updating

**Solution:**
1. Click the "Refresh" button in the History tab
2. Hard refresh (Ctrl+Shift+R)
3. Clear browser cache

## What Each Fix Does

### Fix 1: Removed `report_deliveries` relation
**Why:** The relation might fail if there are no deliveries, causing the entire query to fail
**File:** `app/api/reports/route.ts`

### Fix 2: Added logging
**Why:** To see exactly what's happening at each step
**Files:**
- `app/api/reports/route.ts`
- `app/dashboard/reports/page.tsx`

### Fix 3: Created debug endpoints
**Why:** To test the API in isolation from the complex UI
**Files:**
- `app/api/debug/reports-test/route.ts`
- `app/debug-reports/page.tsx`

### Fix 4: Fixed date handling
**Why:** Was blocking report generation on weekends
**File:** `app/api/reports/generate-period/route.ts`

## Next Steps

1. ✅ Visit `/debug-reports` and check output
2. ✅ Open browser console and check for errors
3. ✅ Check Network tab for API responses
4. ✅ Run the test script: `npm run test:daily-report`
5. ✅ Report back what you see!

## If Still Not Working

**Please provide:**
1. Screenshot of `/debug-reports` page
2. Screenshot of browser console on `/dashboard/reports`
3. Screenshot of Network tab showing `/api/reports` request
4. Output of: `node node_modules/tsx/dist/cli.mjs scripts/test-reports-api.ts`

With this info, I can pinpoint the exact issue!
