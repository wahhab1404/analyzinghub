# Subscription Expiration & Warning System

## Overview

An automated system that:
1. Sends daily warnings to users 3, 2, and 1 days before their subscription expires
2. Automatically kicks users from Telegram channels when subscriptions expire
3. Tracks all warnings and expiration events

## Database Functions

### `send_subscription_warnings()`
Processes subscriptions expiring within 3 days and sends warnings via Telegram.

**Returns:**
- `processed_count`: Number of subscriptions checked
- `warnings_sent`: Number of new warnings sent
- `details`: JSON array with warning details including Telegram usernames and messages

### `process_expired_subscriptions()`
Expires subscriptions past their end date and kicks users from Telegram channels.

**Returns:**
- `expired_count`: Number of subscriptions expired
- `kicked_count`: Number of Telegram memberships marked as kicked
- `details`: JSON array with expiration details for bot processing

## Edge Functions

### subscription-warnings-processor
- **URL**: `{SUPABASE_URL}/functions/v1/subscription-warnings-processor`
- **Authentication**: Bearer token (Anon key)
- **Method**: POST
- **Purpose**: Sends warnings to users about expiring subscriptions

### subscription-expiration-processor
- **URL**: `{SUPABASE_URL}/functions/v1/subscription-expiration-processor`
- **Authentication**: Bearer token (Anon key)
- **Method**: POST
- **Purpose**: Processes expired subscriptions and kicks users from channels

## API Endpoints

### Process Warnings
```
POST /api/subscriptions/process-warnings
```

### Process Expiration
```
POST /api/subscriptions/process-expiration
```

## Setting Up Automated Processing

### Option 1: Supabase Cron Jobs (Recommended)

Add cron jobs to your Supabase project:

```sql
-- Run warnings processor daily at 9 AM UTC
SELECT cron.schedule(
  'subscription-warnings-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/subscription-warnings-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb
  );
  $$
);

-- Run expiration processor daily at 10 AM UTC
SELECT cron.schedule(
  'subscription-expiration-daily',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := '{SUPABASE_URL}/functions/v1/subscription-expiration-processor',
    headers := '{"Authorization": "Bearer {SUPABASE_ANON_KEY}"}'::jsonb
  );
  $$
);
```

### Option 2: External Cron Service (GitHub Actions)

Create `.github/workflows/subscription-processor.yml`:

```yaml
name: Process Subscriptions

on:
  schedule:
    # Run at 9 AM UTC for warnings
    - cron: '0 9 * * *'
    # Run at 10 AM UTC for expiration
    - cron: '0 10 * * *'

jobs:
  process-warnings:
    runs-on: ubuntu-latest
    steps:
      - name: Send Subscription Warnings
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            https://your-project.supabase.co/functions/v1/subscription-warnings-processor

  process-expiration:
    runs-on: ubuntu-latest
    steps:
      - name: Process Expired Subscriptions
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            https://your-project.supabase.co/functions/v1/subscription-expiration-processor
```

### Option 3: Vercel Cron Jobs

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/subscriptions/process-warnings",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/subscriptions/process-expiration",
      "schedule": "0 10 * * *"
    }
  ]
}
```

## Warning Schedule

| Days Before Expiry | Warning Type | When Sent |
|-------------------|--------------|-----------|
| 3 days | `3_days` | 72-48 hours before |
| 2 days | `2_days` | 48-24 hours before |
| 1 day | `1_day` | 24-0 hours before |

Each warning is sent only once per subscription period.

## Telegram Bot Requirements

The system requires your Telegram bot to have:
1. `TELEGRAM_BOT_TOKEN` environment variable configured
2. Administrator permissions in channels to kick users
3. Ability to send direct messages to users

### Bot Setup

1. Create a bot via @BotFather
2. Add the bot as admin to your channels
3. Set bot token in Supabase environment variables

## Warning Message Format

```
Warning: Your subscription to {Analyst Name}'s "{Plan Name}" plan will expire in {X} day(s).
Please renew to continue accessing premium content.
```

## Expiration Message Format

```
Your subscription to {Analyst Name}'s channel has expired.
You have been removed from the channel.
Please renew your subscription to regain access.
```

## Database Tables

### subscription_warnings
Tracks sent warnings to prevent duplicates:
- `subscription_id`: Reference to subscription
- `warning_type`: '3_days', '2_days', or '1_day'
- `sent_at`: Timestamp when warning was sent
- `message_sent`: Boolean flag
- `telegram_username`: Username message was sent to

## Manual Testing

### Test Warning System
```bash
curl -X POST https://your-app.com/api/subscriptions/process-warnings
```

### Test Expiration System
```bash
curl -X POST https://your-app.com/api/subscriptions/process-expiration
```

## Monitoring

Check processing results:
```sql
-- View recent warnings
SELECT
  sw.*,
  s.current_period_end,
  p.full_name,
  ap.name as plan_name
FROM subscription_warnings sw
JOIN subscriptions s ON sw.subscription_id = s.id
JOIN profiles p ON s.subscriber_id = p.id
JOIN analyzer_plans ap ON s.plan_id = ap.id
ORDER BY sw.sent_at DESC
LIMIT 20;

-- View expired subscriptions
SELECT
  s.*,
  p.full_name as subscriber_name,
  ap.name as plan_name
FROM subscriptions s
JOIN profiles p ON s.subscriber_id = p.id
JOIN analyzer_plans ap ON s.plan_id = ap.id
WHERE s.status = 'expired'
ORDER BY s.updated_at DESC
LIMIT 20;
```

## Security

- All database functions use `SECURITY DEFINER` for elevated permissions
- RLS policies restrict access to subscription data
- Service role access for automated processing
- API endpoints can be protected with authentication if needed

## Notes

- Warnings are sent once per day per warning type
- Users must have `telegram_username` set in their profile
- Channel IDs must be correctly configured in `analyzer_plans`
- Kicked users can be manually re-added if they renew
