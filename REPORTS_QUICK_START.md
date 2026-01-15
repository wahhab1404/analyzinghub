# Daily Reports System - Quick Start Guide

## Installation & Setup

### 1. Database Setup

The migrations have been automatically applied. Verify the tables exist:

```sql
-- Check tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('daily_trade_reports', 'report_deliveries', 'report_settings');

-- Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'daily-reports';

-- Check cron job
SELECT * FROM cron.job WHERE jobname = 'auto-daily-reports-generator';
```

### 2. Environment Variables

Ensure these are set in your environment:

```env
# Required (Auto-configured in Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required (Must be configured manually)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
APP_BASE_URL=https://yourdomain.com
```

### 3. Edge Functions Deployment

The edge functions have been deployed:
- ✅ `generate-advanced-daily-report`
- ✅ `auto-daily-reports-scheduler`

Verify they're running:
```bash
# In Supabase Dashboard
# Navigate to Edge Functions tab
# Check both functions show as "Active"
```

### 4. Initial Configuration

#### For Analysts

1. Log in to your dashboard
2. Navigate to **Reports → Settings**
3. Configure:
   - Enable automated reports: ON
   - Language mode: Dual (or your preference)
   - Schedule time: 16:30 (4:30 PM)
   - Timezone: Asia/Riyadh
   - Default channel: Select your subscribers channel
   - Extra channels: Add any additional channels
4. Click **Save Settings**

#### For Admins

Ensure analysts have the correct role:
```sql
-- Check analyst roles
SELECT p.id, p.full_name, p.email, r.name as role
FROM profiles p
JOIN roles r ON p.role_id = r.id
WHERE r.name IN ('Analyzer', 'SuperAdmin');
```

## Usage

### Generate Your First Report

1. Go to **Dashboard → Reports**
2. Select today's date
3. Choose language: **Dual** (English + Arabic)
4. Click **Preview** to test
5. Click **Generate** to create actual report
6. Download or send to Telegram

### Configure Automation

1. Go to **Reports → Settings**
2. Enable automated generation
3. Set your preferred schedule
4. Save settings

The system will automatically generate and send reports daily at the configured time.

### Send to Telegram

From the reports list:
1. Find your generated report
2. Click the **Send** button (paper plane icon)
3. Report will be sent to all configured channels
4. Check delivery status in the list

## Verification Checklist

- [ ] Database tables created
- [ ] Storage bucket exists
- [ ] Cron job scheduled
- [ ] Edge functions deployed
- [ ] Telegram bot token configured
- [ ] Analyst role assigned
- [ ] Settings configured
- [ ] Test report generated successfully
- [ ] Telegram delivery working

## Common Tasks

### Generate Report for Specific Date

```bash
curl -X POST https://yourdomain.com/api/reports/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "date": "2025-01-15",
    "language_mode": "dual",
    "dry_run": false
  }'
```

### Check Cron Job Status

```sql
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'auto-daily-reports-generator';
```

### View Recent Reports

```sql
SELECT
  report_date,
  language_mode,
  status,
  summary->>'total_trades' as total_trades,
  created_at
FROM daily_trade_reports
ORDER BY created_at DESC
LIMIT 10;
```

### Check Delivery Status

```sql
SELECT
  r.report_date,
  d.channel_id,
  d.channel_name,
  d.status,
  d.sent_at,
  d.error_message
FROM report_deliveries d
JOIN daily_trade_reports r ON r.id = d.report_id
ORDER BY d.created_at DESC
LIMIT 20;
```

## Testing

### Test Report Generation

```typescript
// Test in browser console or API client
const response = await fetch('/api/reports/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    language_mode: 'dual',
    dry_run: true // Set to false for actual generation
  })
});

const result = await response.json();
console.log(result);
```

### Test Telegram Sending

```typescript
const response = await fetch('/api/reports/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    report_id: 'YOUR_REPORT_ID',
    channel_ids: ['CHANNEL_ID_1', 'CHANNEL_ID_2'] // Optional
  })
});

const result = await response.json();
console.log(result);
```

### Trigger Scheduler Manually

```bash
# Call the edge function directly
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/auto-daily-reports-scheduler \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Troubleshooting

### Issue: No Reports Generating

**Solution:**
1. Check if you have trades for the selected date
2. Verify analyst role is correct
3. Check edge function logs in Supabase dashboard

### Issue: Telegram Not Sending

**Solution:**
1. Verify `TELEGRAM_BOT_TOKEN` is set
2. Check bot has posting permissions in channels
3. Review `report_deliveries` table for errors
4. Test bot token:
   ```bash
   curl https://api.telegram.org/botYOUR_BOT_TOKEN/getMe
   ```

### Issue: Arabic Text Not Showing

**Solution:**
1. Ensure browser supports Arabic fonts
2. Check if Cairo font is loading (Network tab)
3. Test in different browser
4. Verify HTML has proper `dir="rtl"` attribute

### Issue: Automated Reports Not Running

**Solution:**
1. Check cron job is active:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'auto-daily-reports-generator';
   ```
2. Verify settings are enabled:
   ```sql
   SELECT * FROM report_settings WHERE enabled = true;
   ```
3. Check last_generated_date hasn't already been set for today
4. Review edge function logs

## Next Steps

1. **Customize Report Content**: Edit the HTML template in `generate-advanced-daily-report` edge function
2. **Add More Channels**: Configure additional Telegram channels in settings
3. **Schedule Adjustments**: Modify cron schedule for different times
4. **Language Preferences**: Set default language mode per analyst
5. **Monitor Deliveries**: Regularly check delivery status and errors

## Support Resources

- Full documentation: `ADVANCED_DAILY_REPORTS_SYSTEM.md`
- Database schema: Check migration files in `supabase/migrations/`
- API documentation: Review route files in `app/api/reports/`
- Edge functions: See `supabase/functions/generate-advanced-daily-report/` and `auto-daily-reports-scheduler/`

## Success Metrics

Track these to ensure the system is working:

1. **Generation Success Rate**: `(successful_reports / total_attempts) * 100`
2. **Delivery Success Rate**: `(successful_deliveries / total_deliveries) * 100`
3. **Average Generation Time**: Monitor edge function execution time
4. **User Adoption**: Number of analysts with enabled automation
5. **Report Quality**: User feedback on report accuracy and usefulness

Your advanced daily reports system is now ready to use!
