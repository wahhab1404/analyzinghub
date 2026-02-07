# Reports System Debug Guide

## Issue Summary
User reported two issues:
1. **Can't see generated reports in history tab**
2. **No trades showing in report preview**

## Investigation Results

### Database Status ✅
- Reports exist in the database (`daily_trade_reports` table)
- Reports have proper HTML content (verified lengths: 6K-81K characters)
- Reports have proper trade counts and summary data
- User can query their own reports successfully with service role

### Sample Data Found
```
- 2026-01-27 (monthly): 50 trades, 81KB HTML
- 2026-01-26 (daily): 0 trades, 6KB HTML
- 2026-01-23 (daily): 2 trades, 9KB HTML
- 2026-01-15 (daily): 0 trades, 6KB HTML
```

## Fixes Applied

### 1. API Route Logging
**File:** `app/api/reports/route.ts`
- Added console logging to track:
  - User ID fetching reports
  - User role and admin status
  - Number of reports found
  - Any query errors

### 2. Frontend Logging
**File:** `app/dashboard/reports/page.tsx`
- Added console logging to track:
  - When reports are being loaded
  - HTTP response status
  - Data received from API
  - Any loading errors

### 3. Daily Report Date Handling
**File:** `app/api/reports/generate-period/route.ts`
- Removed market hours check for daily reports
- Now allows generating reports for any date (including weekends)
- Accepts `start_date` parameter for daily reports

### 4. Better Error Display
**File:** `app/dashboard/reports/page.tsx`
- Added "Refresh" button when no reports are shown
- Better null checking for reports array

### 5. TypeScript Build Fix
**File:** `components/settings/ChannelSettings.tsx`
- Fixed JSX syntax error preventing builds

## How Report Generation Works

### Daily Reports
1. Frontend calls `/api/reports/generate` with `{ date, language_mode }`
2. API calls edge function `generate-advanced-daily-report`
3. Edge function queries trades where:
   - Created on that day (active)
   - Closed on that day
   - Expired on that day
4. Generates HTML with trade cards
5. Saves to `daily_trade_reports` table with `period_type='daily'`

### Period Reports (Weekly/Monthly)
1. Frontend calls `/api/reports/generate-period` with `{ period_type, language_mode }`
2. API calls edge function `generate-period-report`
3. Edge function calculates date range and queries all trades in that period
4. Generates HTML with full period analysis
5. Saves to `daily_trade_reports` table with appropriate `period_type`

## Why Some Reports Show 0 Trades

This is **EXPECTED BEHAVIOR**. Reports only include trades that match specific criteria for that period:

- **Daily reports**: Only trades created/closed/expired on that specific day
- **Weekly/Monthly reports**: Only trades within the period date range

If no trades match the criteria, the report shows "No trades recorded" - this is correct!

## Debugging Steps for User

### Step 1: Check Browser Console
1. Open browser DevTools (F12)
2. Go to Reports page
3. Check Console tab for log messages:
   ```
   [Reports Page] Loading reports...
   [Reports Page] Response status: 200
   [Reports Page] Received data: { reportsCount: X, ... }
   ```

### Step 2: Check Server Logs
If using local development:
```bash
# Check terminal running `npm run dev` for:
[Reports API] Fetching reports for user: xxx
[Reports API] User role: Analyzer isAdmin: false
[Reports API] Found X reports out of Y total
```

### Step 3: Test API Directly
```bash
# Run test script
npm run telegram:status
node node_modules/tsx/dist/cli.mjs scripts/test-reports-api.ts
```

### Step 4: Generate a Test Report
1. Go to Reports → Generate tab
2. Select "Monthly" period type
3. Select language (Arabic or Dual recommended)
4. Click "Generate"
5. Wait for success message
6. Check History tab

## Common Issues & Solutions

### Issue: No reports visible in History tab
**Possible Causes:**
1. RLS policy blocking access
2. User role not set to "Analyzer" or "SuperAdmin"
3. Frontend JavaScript error
4. Browser cache issue

**Solutions:**
1. Check browser console for errors
2. Verify user role in database
3. Hard refresh browser (Ctrl+Shift+R)
4. Check server logs for RLS errors

### Issue: Report preview shows no trades
**This may be expected!** Check:
1. What date range is the report for?
2. Were any trades created/closed/expired in that range?
3. Generate a monthly report instead of daily to see more data

### Issue: "Market is closed" error when generating daily report
**Fixed!** The code now allows generating reports for any date.

## Testing Commands

```bash
# Build project
npm run build

# Test reports API
node node_modules/tsx/dist/cli.mjs scripts/test-reports-api.ts

# Check Telegram status
npm run telegram:status

# Generate test daily report
npm run test:daily-report
```

## Database Schema

### daily_trade_reports table
- `id`: UUID primary key
- `report_date`: Date of report
- `period_type`: 'daily' | 'weekly' | 'monthly' | 'custom'
- `start_date`: Period start (for non-daily)
- `end_date`: Period end (for non-daily)
- `author_id`: User who generated report
- `html_content`: Full HTML of report
- `summary`: JSON with metrics
- `trade_count`: Number of trades in report
- `status`: 'generated' | 'sent' | 'failed'
- `file_url`: Signed URL for download

### RLS Policies
```sql
-- Users can view own reports
author_id = auth.uid()

-- Or reports from channels they own
telegram_channel_id IN (user's channels)
```

## Next Steps

1. **User should check browser console** - This will show if reports are being loaded
2. **User should try generating a monthly report** - This will show more trades
3. **User should check server logs** - This will reveal any RLS or auth issues
4. **If still not working**, check if user role is set correctly in `profiles` table
