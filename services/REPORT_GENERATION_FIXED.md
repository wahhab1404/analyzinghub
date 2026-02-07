# Report Generation Fixed

## What Was Wrong

The issue was with the role permission check in `/app/api/reports/generate/route.ts`. The query to fetch the user's role was using incorrect Supabase relation syntax that was failing silently.

### The Problem
```typescript
// This wasn't working correctly:
const { data: profile } = await supabase
  .from('profiles')
  .select('role:roles(name)')
  .eq('id', user.id)
  .single()
```

### The Fix
```typescript
// Changed to explicit queries:
// 1. Get profile with role_id
const { data: profile } = await supabase
  .from('profiles')
  .select('role_id')
  .eq('id', user.id)
  .single()

// 2. Get role name from roles table
const { data: role } = await supabase
  .from('roles')
  .select('name')
  .eq('id', profile.role_id)
  .single()
```

## What Was Added

### Enhanced Logging
Added comprehensive console logging throughout the API route to track:
- When API is called
- User ID
- User role
- Request body details
- Edge function URL
- Edge function response status
- Success/error states

### Better Error Handling
- Profile not found errors
- Role not found errors
- Edge function errors with detailed messages
- All errors logged to console

### Success Response
Now returns a structured response:
```json
{
  "success": true,
  "message": "Report generated successfully",
  "report_id": "...",
  "file_url": "...",
  "metrics": { ... }
}
```

## How to Test

### 1. Check Your Role
Make sure you're logged in as an **Analyzer** or **SuperAdmin**.

You can verify your role by:
1. Going to the Reports page
2. Looking at the debug panel (shows in development mode)
3. Or checking the browser console when clicking "Generate Report"

### 2. Generate a Report
1. Go to **Dashboard → Reports**
2. Select a date (or use today's date)
3. Choose language mode (English, Arabic, or Both)
4. Click **"Generate Report"**

### 3. Check Logs
Open browser DevTools Console (F12) and look for:
```
[Generate Button] Clicked
[Generate Button] Has access: true
[Generate Button] User role: Analyzer
[Generate Report] New report created: { report_id: "...", ... }
```

Server logs will show:
```
[Generate Report API] Request received
[Generate Report API] User: <your-user-id>
[Generate Report] User role: Analyzer
[Generate Report] Request body: { date: "2026-02-07", ... }
[Generate Report] Calling edge function: ...
[Generate Report] Edge function response status: 200
[Generate Report] Successfully generated report: <report-id>
```

### 4. View Report
After generation:
1. You'll see a success message
2. Switch to the **"History"** tab
3. Your report should appear at the top
4. You can:
   - Preview the HTML report (eye icon)
   - Preview the image (image icon)
   - Download HTML
   - Print as PDF
   - Send to Telegram

## Troubleshooting

### Button is Disabled
- Check if you have the Analyzer or SuperAdmin role
- Look at the debug panel on the Reports page
- Check browser console for access logs

### "Unauthorized" Error
- You're not logged in
- Session expired - try logging out and back in

### "Forbidden" Error
- Your role is not Analyzer or SuperAdmin
- Contact admin to upgrade your account

### "Profile not found" or "Role not found"
- Database issue - check that your user exists in the profiles table
- Check that your profile has a valid role_id

### Edge Function Errors
- Check server logs for detailed error messages
- Verify environment variables are set correctly
- Make sure edge functions are deployed

## Testing Script

Run this to test report generation directly:
```bash
npm run tsx scripts/test-report-generation-debug.ts
```

Expected output:
```
✅ Found analyzer: Analyzer ( <id> )
📊 Analyzer has X trades
📅 Generating report for date: 2026-02-07
✅ Report generated successfully!
```
