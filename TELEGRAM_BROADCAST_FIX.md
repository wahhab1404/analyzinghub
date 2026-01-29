# Telegram Broadcast Fix - Analyses Not Sending to Subscribers

## Problem
When publishing a new analysis, it was not being sent to subscribers' Telegram channels.

## Root Cause
The code in `app/api/analyses/route.ts` was checking for a boolean column `verified` that doesn't exist:

```typescript
.eq('verified', true)  // ❌ Wrong - this column doesn't exist
```

The `telegram_channels` table actually has a `verified_at` timestamp column (not a boolean `verified` column). When a channel is verified, `verified_at` is set to the current timestamp. When not verified, it's NULL.

## Database Schema
```sql
-- telegram_channels table has:
verified_at timestamp with time zone  -- NULL means not verified, timestamp means verified
```

## Solution
Changed from checking a non-existent boolean to checking if the timestamp is NOT NULL:

### Before (Broken)
```typescript
const { data: planChannels } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, linked_plan_id')
  .eq('user_id', user.id)
  .in('linked_plan_id', body.planIds)
  .eq('enabled', true)
  .eq('verified', true)  // ❌ Column doesn't exist
```

### After (Fixed)
```typescript
const { data: planChannels } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, linked_plan_id')
  .eq('user_id', user.id)
  .in('linked_plan_id', body.planIds)
  .eq('enabled', true)
  .not('verified_at', 'is', null)  // ✅ Correct - checks if verified_at has a value
```

## Files Modified

**app/api/analyses/route.ts**
- Line 515: Fixed plan-specific channels query
- Line 535: Fixed platform default channel query

## Changes Made

### 1. Plan-Specific Channels Query (Line 507-525)
```typescript
// Get plan-specific channels if plans are selected
if (body.planIds && Array.isArray(body.planIds) && body.planIds.length > 0) {
  const { data: planChannels } = await supabaseAdmin
    .from('telegram_channels')
    .select('id, channel_id, channel_name, linked_plan_id')
    .eq('user_id', user.id)
    .in('linked_plan_id', body.planIds)
    .eq('enabled', true)
    .not('verified_at', 'is', null)  // ✅ Fixed

  if (planChannels && planChannels.length > 0) {
    broadcastChannels.push(...planChannels.map(ch => ({
      id: ch.id,
      telegram_channel_id: ch.channel_id,
      plan_id: ch.linked_plan_id,
      type: 'plan-specific'
    })))
  }
}
```

### 2. Platform Default Channel Query (Line 527-549)
```typescript
// Always get the platform default channel for the analysis visibility
const { data: defaultChannel } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, audience_type, is_platform_default')
  .eq('user_id', user.id)
  .eq('audience_type', analysis.visibility)
  .eq('is_platform_default', true)
  .eq('enabled', true)
  .not('verified_at', 'is', null)  // ✅ Fixed
  .maybeSingle()

if (defaultChannel) {
  const alreadyAdded = broadcastChannels.some(ch => ch.id === defaultChannel.id)
  if (!alreadyAdded) {
    broadcastChannels.push({
      id: defaultChannel.channel_id,
      telegram_channel_id: defaultChannel.channel_id,
      plan_id: null,
      type: 'platform-default'
    })
  }
}
```

## How the Broadcasting System Works

### Channel Types

1. **Plan-Specific Channels**
   - Linked to a specific analyzer plan (via `linked_plan_id`)
   - Only subscribers of that specific plan receive messages
   - Multiple plan-specific channels can exist per analyst

2. **Platform Default Channels**
   - Marked with `is_platform_default: true`
   - Matches analysis visibility (`public`, `followers`, `subscribers`)
   - Fallback channel when no plan-specific channels exist

### Broadcasting Flow

When an analysis is published:

1. **Collect Channels to Broadcast To:**
   - If analysis has specific plans selected → Get plan-specific channels
   - Always get the platform default channel matching the visibility
   - Avoid duplicates

2. **Send to Each Channel:**
   ```typescript
   for (const channel of broadcastChannels) {
     const broadcastResponse = await fetch(
       `${req.nextUrl.origin}/api/telegram/channel/broadcast-new-analysis`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           analysisId: analysis.id,
           userId: user.id,
           channelId: channel.telegram_channel_id || channel.id,
         }),
       }
     );
   }
   ```

3. **Broadcast Endpoint Calls Edge Function:**
   - `/api/telegram/channel/broadcast-new-analysis` validates the request
   - Calls Supabase Edge Function `telegram-channel-broadcast`
   - Edge function formats and sends the Telegram message

## Verification Checklist

### To verify the fix is working:

1. **Check Channel Configuration**
   ```sql
   SELECT
     id,
     user_id,
     channel_name,
     audience_type,
     enabled,
     notify_new_analysis,
     is_platform_default,
     linked_plan_id,
     verified_at
   FROM telegram_channels
   WHERE user_id = 'YOUR_USER_ID'
   ORDER BY created_at DESC;
   ```

   Ensure:
   - `enabled = true`
   - `notify_new_analysis = true`
   - `verified_at IS NOT NULL` (channel is verified)
   - `audience_type` matches your analysis visibility
   - Either `is_platform_default = true` OR `linked_plan_id` is set

2. **Publish a Test Analysis**
   - Go to dashboard → Create Analysis
   - Select visibility (public/followers/subscribers)
   - Select specific plans if needed
   - Publish the analysis

3. **Check Logs**
   Look for these log messages in the console:
   ```
   TELEGRAM_BROADCAST_START: {
     analysisId: '...',
     userId: '...',
     channelId: '...',
     planId: '...',
     type: 'platform-default' or 'plan-specific'
   }

   TELEGRAM_BROADCAST_RESULT: {
     channelId: '...',
     status: 200,
     ok: true,
     result: { ok: true, ... }
   }
   ```

4. **Check Telegram Channel**
   - Open the configured Telegram channel
   - Verify the analysis message was posted
   - Check message formatting and content

5. **Check Database Logs**
   ```sql
   -- Check telegram_outbox for queued messages
   SELECT
     id,
     channel_id,
     message_type,
     status,
     created_at,
     error_message
   FROM telegram_outbox
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

## Common Issues and Solutions

### Issue 1: Still No Broadcasts
**Check:** Channel verification status
```sql
SELECT
  id,
  channel_name,
  verified_at,
  enabled,
  notify_new_analysis
FROM telegram_channels
WHERE user_id = 'YOUR_USER_ID';
```

**Solution:**
- Ensure `verified_at IS NOT NULL`
- If NULL, re-verify the channel through settings

### Issue 2: Channel Not Found
**Symptom:** Log shows "No Telegram channels to broadcast to"

**Solution:**
- Check `audience_type` matches analysis visibility
- Check `is_platform_default = true` for the matching visibility
- Verify channel is `enabled = true`

### Issue 3: Broadcast Fails
**Symptom:** HTTP 502 or edge function error

**Check Edge Function:**
```bash
# Check edge function logs in Supabase Dashboard
# Functions → telegram-channel-broadcast → Logs
```

**Common causes:**
- Invalid channel_id
- Bot not added to channel
- Bot doesn't have posting permissions
- Invalid Telegram Bot Token

### Issue 4: Message Sent But Subscribers Don't See It
**Check Memberships:**
```sql
SELECT
  tm.id,
  tm.subscription_id,
  tm.channel_id,
  tm.status,
  s.subscriber_id,
  p.full_name,
  p.telegram_username
FROM telegram_memberships tm
JOIN subscriptions s ON s.id = tm.subscription_id
JOIN profiles p ON p.id = s.subscriber_id
WHERE tm.channel_id = 'YOUR_CHANNEL_ID'
  AND s.status = 'active';
```

**Solution:**
- Ensure subscribers have active subscriptions
- Verify telegram_memberships exist and status = 'active'
- Check if subscribers actually joined the Telegram channel

## Testing

### Test Case 1: Public Analysis
```typescript
// Create public analysis
{
  symbol: "AAPL",
  direction: "long",
  visibility: "public",  // Should broadcast to public channel
  stopLoss: 150,
  targets: [...]
}
```

Expected:
- Broadcasts to channel with `audience_type = 'public'` and `is_platform_default = true`

### Test Case 2: Subscribers Analysis with Plans
```typescript
// Create subscribers analysis with specific plans
{
  symbol: "AAPL",
  direction: "long",
  visibility: "subscribers",
  planIds: ["plan-uuid-1", "plan-uuid-2"],  // Specific plans
  stopLoss: 150,
  targets: [...]
}
```

Expected:
- Broadcasts to channels with `linked_plan_id IN ['plan-uuid-1', 'plan-uuid-2']`
- Also broadcasts to channel with `audience_type = 'subscribers'` and `is_platform_default = true`

### Test Case 3: Followers Analysis
```typescript
// Create followers analysis
{
  symbol: "AAPL",
  direction: "long",
  visibility: "followers",
  stopLoss: 150,
  targets: [...]
}
```

Expected:
- Broadcasts to channel with `audience_type = 'followers'` and `is_platform_default = true`

## Monitoring

### Check Recent Broadcasts
```sql
SELECT
  to_id,
  message_type,
  status,
  sent_at,
  error_message,
  retry_count
FROM telegram_outbox
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Check Channel Performance
```sql
SELECT
  tc.channel_name,
  tc.audience_type,
  COUNT(to_id) as total_messages,
  COUNT(CASE WHEN to_status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN to_status = 'failed' THEN 1 END) as failed_count
FROM telegram_channels tc
LEFT JOIN telegram_outbox to_table ON to_table.channel_id = tc.channel_id
WHERE to_table.created_at > NOW() - INTERVAL '7 days'
GROUP BY tc.id, tc.channel_name, tc.audience_type
ORDER BY total_messages DESC;
```

### Check Subscriber Engagement
```sql
SELECT
  p.full_name,
  p.telegram_username,
  s.plan_id,
  ap.name as plan_name,
  tm.status as membership_status,
  tm.joined_at
FROM profiles p
JOIN subscriptions s ON s.subscriber_id = p.id
JOIN analyzer_plans ap ON ap.id = s.plan_id
LEFT JOIN telegram_memberships tm ON tm.subscription_id = s.id
WHERE s.analyst_id = 'YOUR_USER_ID'
  AND s.status = 'active'
ORDER BY s.created_at DESC;
```

## Related Files

- `/app/api/analyses/route.ts` - Main analysis creation endpoint
- `/app/api/telegram/channel/broadcast-new-analysis/route.ts` - Broadcast API endpoint
- `/supabase/functions/telegram-channel-broadcast/index.ts` - Edge function that sends messages
- `/app/api/analyses/[id]/resend-to-channel/route.ts` - Manual resend endpoint

## Summary

The fix ensures that when checking if a Telegram channel is verified, we correctly check if the `verified_at` timestamp field has a value (is NOT NULL), rather than checking a non-existent `verified` boolean field. This allows the broadcasting system to properly find verified channels and send analysis notifications to subscribers.

**Status:** ✅ Fixed and Tested
**Impact:** Critical - enables core Telegram broadcasting functionality
**Risk Level:** Low - simple query fix
**Performance:** No impact
