# Telegram Channel Subscription System

## Overview

This feature implements automatic Telegram channel access management for subscription plans. When a trader subscribes to an analyzer's plan, they provide their Telegram username and automatically receive a private channel invite link via the bot. When their subscription expires without renewal, they are automatically removed from the channel.

## How It Works

### Subscription Flow

1. **Trader Subscribes to Plan**
   - Trader clicks "Subscribe" on an analyzer's plan
   - If telegram_username not in profile, a dialog appears
   - Trader enters their Telegram username (without @)
   - System validates and saves username to profile

2. **Automatic Channel Invitation**
   - API creates subscription record
   - Generates single-use invite link (24-hour expiration)
   - Bot sends DM to trader with invite link
   - Telegram membership record created with status 'invited'
   - Trader receives welcome message with channel link

3. **Channel Access**
   - Trader clicks invite link in Telegram
   - Joins private channel
   - Membership status updated to 'joined'
   - Full access to premium content

### Expiration Flow

1. **Subscription Expires**
   - Daily cron job checks for expired subscriptions
   - Marks subscriptions as 'expired' status
   - Updates telegram_memberships to 'kicked' status

2. **User Removal**
   - Bot kicks user from Telegram channel using chat_id
   - Sends notification to user about expiration
   - User can no longer access channel content

3. **Renewal**
   - If user renews subscription, new invite generated
   - New membership record created
   - Bot sends new invite link

## Database Schema

### New Column in `profiles`

```sql
-- Stores user's Telegram username for direct messaging
telegram_username text UNIQUE
```

### Existing Tables Used

1. **subscriptions**
   - Stores metadata with telegram_username
   - Tracks subscription status

2. **telegram_memberships**
   - Links subscriptions to channels
   - Tracks membership status (pending/invited/joined/kicked)
   - Stores invite links

3. **analyzer_plans**
   - Links to telegram_channel_id
   - Associates plans with Telegram channels

## API Changes

### POST /api/subscriptions/create

**New Request Body:**
```typescript
{
  planId: string
  telegramUsername?: string  // NEW: Optional, required if not in profile
}
```

**New Response:**
```typescript
{
  ok: boolean
  subscriptionId: string
  status: string
  periodEnd: string
  inviteLink: string | null
  channelName: string | null
  hasTelegramChannel: boolean
  inviteSent: boolean           // NEW: Whether invite was sent via bot
  telegramUsername: string      // NEW: Username used
  message: string               // NEW: User-friendly message
}
```

**New Error Response:**
```typescript
{
  error: string
  requiresTelegramUsername: boolean  // NEW: Triggers username dialog
  message: string
}
```

## Frontend Components

### TelegramUsernameDialog

New dialog component that collects Telegram username:

**Features:**
- Input validation (5+ chars, alphanumeric + underscore only)
- Auto-removes @ symbol
- Clear instructions for users
- Explains the invite process
- Shows step-by-step workflow

**Location:** `components/subscriptions/TelegramUsernameDialog.tsx`

### Updated SubscriptionPlans Component

**Changes:**
- Detects `requiresTelegramUsername` error
- Shows TelegramUsernameDialog when needed
- Passes username to API on retry
- Shows success messages with username confirmation
- Indicates invite was sent via bot

## Edge Functions

### subscription-expiration-processor

**Updated Logic:**
1. Fetches expired subscriptions from last hour
2. For each expired subscription:
   - Gets telegram_username from profile
   - Retrieves user's chat_id from telegram_accounts
   - Kicks user using Telegram Bot API `banChatMember`
   - Sends expiration notification via bot DM
   - Updates membership status to 'kicked'

**Telegram Bot API Calls:**
```typescript
// Kick user from channel
POST https://api.telegram.org/bot{token}/banChatMember
{
  chat_id: channel_id,
  user_id: numeric_chat_id,
  revoke_messages: false
}

// Send expiration notification
POST https://api.telegram.org/bot{token}/sendMessage
{
  chat_id: @username,
  text: "Subscription expired message",
  parse_mode: "Markdown"
}
```

## User Experience Flow

### For Traders

1. **First-Time Subscription**
   ```
   Click Subscribe → Enter Telegram Username → Complete
   ↓
   Receive bot DM with invite link
   ↓
   Click link → Join channel
   ```

2. **Subsequent Subscriptions**
   ```
   Click Subscribe → Instant activation (username already saved)
   ↓
   Receive bot DM with invite link
   ↓
   Click link → Join new channel
   ```

3. **Subscription Expiration**
   ```
   Subscription ends → Bot sends notification
   ↓
   Removed from channel → Lose access
   ↓
   Renew to get new invite
   ```

### For Analyzers

1. **Plan Setup**
   - Create subscription plan
   - Link to Telegram channel
   - Set pricing and features

2. **Subscriber Management**
   - View active subscribers
   - See telegram usernames
   - Monitor membership status

3. **Automatic Operations**
   - New subscribers auto-invited
   - Expired users auto-removed
   - No manual intervention needed

## Security Features

### Username Validation
- Minimum 5 characters
- Alphanumeric and underscore only
- Unique per user
- Sanitized (@ symbol removed)

### Invite Link Security
- Single-use links (member_limit: 1)
- 24-hour expiration
- Generated per subscription
- Cannot be reused

### Data Protection
- Telegram usernames stored securely in profiles
- RLS policies protect membership data
- Service role only for bot operations
- Audit trail in membership records

## Telegram Bot Requirements

### Bot Permissions

The bot must have:
1. **Channel Admin Rights**
   - Add members
   - Ban/kick members
   - Generate invite links

2. **DM Capabilities**
   - Send messages to users
   - Users must start bot first OR have privacy settings allowing messages

### Bot Configuration

```env
TELEGRAM_BOT_TOKEN=your_bot_token
```

Bot must be added as admin to all analyzer channels.

## Testing Guide

### Test Subscription Flow

1. **Test Username Collection**
   ```bash
   # Ensure user has no telegram_username
   # Try to subscribe
   # Verify dialog appears
   # Enter username
   # Check profile updated
   ```

2. **Test Invite Generation**
   ```bash
   # Subscribe with telegram username
   # Check bot sends DM
   # Verify invite link received
   # Click link and join channel
   ```

3. **Test Expiration**
   ```bash
   # Create subscription
   # Manually expire (update current_period_end)
   # Run expiration processor
   # Verify user kicked from channel
   # Verify notification sent
   ```

### Manual Testing Commands

```bash
# Check user's telegram username
SELECT telegram_username FROM profiles WHERE id = 'user_id';

# Check subscription and membership
SELECT
  s.id,
  s.status,
  s.current_period_end,
  tm.status as membership_status,
  tm.invite_link
FROM subscriptions s
LEFT JOIN telegram_memberships tm ON tm.subscription_id = s.id
WHERE s.subscriber_id = 'user_id';

# Manually trigger expiration
SELECT process_expired_subscriptions();

# Check telegram_memberships status
SELECT * FROM telegram_memberships WHERE subscription_id = 'sub_id';
```

## Error Handling

### Common Errors and Solutions

1. **"Telegram username required"**
   - Solution: Dialog auto-appears to collect username
   - User enters username and retries

2. **"Failed to send invite"**
   - Bot may not have DM access
   - User privacy settings block bot
   - Fallback: Invite link shown in success toast

3. **"Failed to kick user"**
   - User may have already left
   - Bot may lack permissions
   - Status still updated to 'kicked'

4. **"Username already taken"**
   - Unique constraint violation
   - User must choose different username
   - Clear error message shown

## Monitoring

### Key Metrics to Track

1. **Subscription Success Rate**
   - Subscriptions created
   - Invites sent successfully
   - Users joined channels

2. **Expiration Processing**
   - Subscriptions expired
   - Users kicked successfully
   - Notifications delivered

3. **Error Rates**
   - Failed invite generations
   - Failed bot messages
   - Failed kick operations

### Logs to Monitor

```typescript
// Subscription creation
console.log('Subscription created:', { subscriptionId, telegramUsername });
console.log('Invite sent:', { success, username });

// Expiration processing
console.log('Processing expired:', { expired_count, kicked_count });
console.log('Kick result:', { username, kicked, error });
```

## Future Enhancements

### Potential Improvements

1. **Multi-Channel Support**
   - Support multiple channels per plan
   - Different content tiers

2. **Grace Period**
   - Keep access for 3 days after expiration
   - Send multiple warnings

3. **Automatic Verification**
   - Bot auto-verifies username when user messages
   - Link account on first contact

4. **Channel Analytics**
   - Track member activity
   - Engagement metrics
   - Content performance

5. **Bulk Operations**
   - Mass invite for existing subscribers
   - Batch remove on plan changes

## Troubleshooting

### User Can't Receive Invite

**Possible Causes:**
1. Telegram privacy settings block bot
2. User hasn't started bot
3. Wrong username entered

**Solutions:**
- Instruct user to start bot first
- Check username spelling
- Fallback: Show invite link in UI

### User Not Removed After Expiration

**Possible Causes:**
1. Cron job not running
2. Bot lacks kick permissions
3. User already left channel

**Solutions:**
- Check cron job status
- Verify bot admin rights
- Manual removal if needed

### Multiple Invites Generated

**Possible Causes:**
1. Duplicate subscription attempts
2. Retry without checking existing

**Solutions:**
- Check for existing active subscription
- Reuse existing invite if valid

## Best Practices

### For Analyzers

1. **Channel Setup**
   - Add bot as admin first
   - Test invite generation
   - Verify bot can kick members

2. **User Communication**
   - Explain Telegram requirement
   - Provide clear instructions
   - Set expectations for access

3. **Content Strategy**
   - Regular valuable content
   - Exclusive channel benefits
   - Engagement with subscribers

### For Traders

1. **Account Setup**
   - Correct Telegram username
   - Start bot first
   - Adjust privacy settings

2. **Subscription Management**
   - Monitor expiration dates
   - Renew before expiration
   - Update username if changed

## Summary

This feature provides:
- ✅ Seamless channel access on subscription
- ✅ Automatic invite delivery via bot
- ✅ Auto-removal on expiration
- ✅ Secure username management
- ✅ Complete audit trail
- ✅ User-friendly flow
- ✅ Error handling and fallbacks

The system ensures analyzers can monetize content on Telegram while automating the entire access control process, from invitation to removal.
