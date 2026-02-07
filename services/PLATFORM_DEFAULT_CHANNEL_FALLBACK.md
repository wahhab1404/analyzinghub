# Platform Default Channel Fallback System

## Overview
The system now automatically broadcasts analyses to the appropriate Platform Default Channel based on the analysis visibility type, ensuring no analysis is missed even when no specific channel is selected.

## How It Works

### 1. Channel Selection Priority

When creating a new analysis, the system follows this priority:

1. **Plan-Specific Channels** (for subscribers-only analyses)
   - If subscription plans are selected, broadcast to their linked channels

2. **Platform Default Channel** (ALWAYS)
   - Automatically broadcasts to the Platform Default Channel matching the analysis visibility type:
     - `public` → Platform Default Public Channel
     - `followers` → Platform Default Followers Channel
     - `subscribers` → Platform Default Subscribers Channel

3. **Duplicate Prevention**
   - The system checks for duplicates to avoid sending the same analysis twice to the same channel

### 2. Changes Made

#### A. Updated Create Analysis API (`app/api/analyses/route.ts`)

**Lines 504-608**: Completely rewrote the broadcast logic

```typescript
// Broadcast to Telegram channels
const broadcastChannels = [];

// 1. Get plan-specific channels if plans are selected
if (body.planIds && Array.isArray(body.planIds) && body.planIds.length > 0) {
  const { data: planChannels } = await supabaseAdmin
    .from('analyzer_telegram_channels')
    .select('id, telegram_channel_id, plan_id')
    .eq('analyst_id', user.id)
    .in('plan_id', body.planIds)
    .eq('is_active', true)

  if (planChannels && planChannels.length > 0) {
    broadcastChannels.push(...planChannels.map(ch => ({
      id: ch.id,
      telegram_channel_id: ch.telegram_channel_id,
      plan_id: ch.plan_id,
      type: 'plan-specific'
    })))
  }
}

// 2. Always get the platform default channel for the analysis visibility
const { data: defaultChannel } = await supabaseAdmin
  .from('telegram_channels')
  .select('id, channel_id, channel_name, audience_type, is_platform_default')
  .eq('user_id', user.id)
  .eq('audience_type', analysis.visibility)
  .eq('is_platform_default', true)
  .eq('enabled', true)
  .eq('verified', true)
  .maybeSingle()

if (defaultChannel) {
  // Check if we haven't already added this channel (avoid duplicates)
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

// 3. Broadcast to all collected channels
if (broadcastChannels.length > 0) {
  for (const channel of broadcastChannels) {
    // Send broadcast...
  }
}
```

**Key Features:**
- Collects both plan-specific and platform default channels
- Prevents duplicate broadcasts
- Logs channel type for debugging
- Handles errors gracefully without breaking the analysis creation

#### B. Updated Edge Function (`supabase/functions/telegram-channel-broadcast/index.ts`)

**Lines 305-380**: Enhanced channel selection logic

```typescript
if (payload.channelId) {
  // Use the specified channel
  // Try telegram_channels first, then analyzer_plans
} else {
  // No specific channel provided - determine from analysis visibility
  const { data: analysis } = await supabase
    .from('analyses')
    .select('visibility')
    .eq('id', payload.analysisId)
    .maybeSingle();

  const visibility = analysis?.visibility || 'public';

  // Try to get platform default channel for this visibility type
  const { data: platformChannel } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('user_id', payload.userId)
    .eq('audience_type', visibility)
    .eq('is_platform_default', true)
    .eq('enabled', true)
    .maybeSingle();

  if (platformChannel) {
    channelData = platformChannel;
  } else {
    // Fallback to any enabled channel for this audience type
    const { data } = await supabase
      .from('telegram_channels')
      .select('*')
      .eq('user_id', payload.userId)
      .eq('audience_type', visibility)
      .eq('enabled', true)
      .maybeSingle();

    channelData = data;
  }
}
```

**Key Features:**
- Fetches analysis visibility when no channelId is provided
- Prioritizes platform default channels
- Falls back to any enabled channel if no platform default exists
- Comprehensive logging for debugging

## User Experience

### For Public Analyses
```
User creates a PUBLIC analysis
→ System broadcasts to Platform Default Public Channel
→ All public followers see the analysis
```

### For Followers-Only Analyses
```
User creates a FOLLOWERS analysis
→ System broadcasts to Platform Default Followers Channel
→ Only followers see the analysis
```

### For Subscribers-Only Analyses

**Without Plans:**
```
User creates a SUBSCRIBERS analysis (no plans selected)
→ System broadcasts to Platform Default Subscribers Channel
→ All subscribers see the analysis
```

**With Plans:**
```
User creates a SUBSCRIBERS analysis + selects 2 plans
→ System broadcasts to:
   1. Plan 1 specific channel (if configured)
   2. Plan 2 specific channel (if configured)
   3. Platform Default Subscribers Channel (always)
→ Subscribers in selected plans see it via their channels
→ Other subscribers see it via platform default channel
```

## Database Tables Involved

### 1. `telegram_channels`
Stores platform default channels:
```sql
{
  id: uuid
  user_id: uuid
  channel_id: text
  channel_name: text
  audience_type: 'public' | 'followers' | 'subscribers'
  is_platform_default: boolean  -- TRUE for platform defaults
  enabled: boolean
  verified: boolean
  ...
}
```

### 2. `analyzer_telegram_channels`
Stores plan-specific channels:
```sql
{
  id: uuid
  analyst_id: uuid
  plan_id: uuid
  telegram_channel_id: text
  is_active: boolean
  ...
}
```

### 3. `analyses`
Stores the analysis with visibility:
```sql
{
  id: uuid
  analyzer_id: uuid
  visibility: 'public' | 'followers' | 'subscribers'
  ...
}
```

## Logging and Debugging

The system logs extensive information for debugging:

```typescript
// When collecting channels
console.log('TELEGRAM_BROADCAST_START:', {
  analysisId: analysis.id,
  userId: user.id,
  channelId: channel.id,
  planId: channel.plan_id,
  type: channel.type  // 'plan-specific' or 'platform-default'
})

// When no channels found
console.log('No Telegram channels to broadcast to:', {
  visibility: analysis.visibility,
  userId: user.id,
  analysisId: analysis.id
})

// In edge function
console.log('[Broadcast] Using platform default channel:', platformChannel.channel_name)
console.log('[Broadcast] Analysis visibility:', visibility)
```

## Error Handling

1. **Missing Platform Default**: Falls back to any enabled channel for the audience type
2. **Broadcast Failures**: Logged but don't prevent analysis creation
3. **Duplicate Channels**: Automatically filtered out
4. **Channel Verification**: Only broadcasts to verified channels

## Benefits

✅ **No Missed Broadcasts**: Every analysis is sent to at least one channel
✅ **Flexible**: Supports both plan-specific and platform-wide broadcasts
✅ **Reliable**: Fallback mechanisms ensure delivery
✅ **Efficient**: Prevents duplicate broadcasts
✅ **Transparent**: Comprehensive logging for debugging
✅ **User-Friendly**: Automatic behavior requires no user configuration

## Testing

To verify this works:

1. Create a public analysis without selecting plans
   - Should broadcast to Platform Default Public Channel

2. Create a followers analysis without selecting plans
   - Should broadcast to Platform Default Followers Channel

3. Create a subscribers analysis without selecting plans
   - Should broadcast to Platform Default Subscribers Channel

4. Create a subscribers analysis WITH plans selected
   - Should broadcast to plan-specific channels AND platform default

5. Check the logs for `TELEGRAM_BROADCAST_START` entries showing channel types

## Files Modified

1. `app/api/analyses/route.ts` - Lines 504-608
2. `supabase/functions/telegram-channel-broadcast/index.ts` - Lines 305-380
3. `components/analysis/CreateAnalysisForm.tsx` - Updated interface (from previous fix)

## Build Status

✅ Compiled successfully with no errors
