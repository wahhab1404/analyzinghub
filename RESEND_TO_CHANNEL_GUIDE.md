# Resend Analysis to Telegram Channel - User Guide

## Overview

Analyzers can now send their analyses to multiple Telegram channels. This is useful for:
- Managing different subscriber tiers (public, followers, premium subscribers)
- Cross-posting to multiple channels
- Reaching different audiences with the same content
- Testing channels before going live

## How to Use

### Step 1: View Your Analysis

1. Navigate to any of your published analyses
2. Open the analysis detail page

### Step 2: Resend to Channel

1. Look for the action buttons at the top of the analysis
2. You'll see two Telegram buttons:
   - **📤 Send** - Sends to your default channel (based on analysis visibility)
   - **🔁 Resend** - Opens the channel selector dialog

3. Click the **🔁 Resend** button

### Step 3: Select Target Channel

A dialog will appear showing all your connected Telegram channels:

```
┌─────────────────────────────────────────┐
│  Send to Telegram Channel               │
├─────────────────────────────────────────┤
│  ○ Public Channel                       │
│    @my_public_channel                   │
│    [🌐 public]                          │
│                                         │
│  ○ Followers Channel                    │
│    @my_followers_channel                │
│    [👥 followers]                       │
│                                         │
│  ○ Premium Subscribers                  │
│    @my_premium_channel                  │
│    [🔒 subscribers]                     │
│                                         │
│  [Cancel]  [📤 Send to Channel]        │
└─────────────────────────────────────────┘
```

4. Select the channel you want to send to
5. Click **Send to Channel**

### Step 4: Confirmation

- You'll see a success message: "Analysis sent to [Channel Name] successfully! 🎉"
- The analysis is now broadcast to that channel

## Channel Types

Your channels are organized by audience type:

### 🌐 Public Channels
- Open to everyone
- No subscription required
- Best for: General audience, marketing, public updates

### 👥 Followers Channels
- Only for users who follow you
- Free but gated
- Best for: Community building, engaged audience

### 🔒 Subscribers Channels
- Paid subscribers only
- Premium content
- Best for: Exclusive analysis, paid tiers

## Features

✅ **Multiple Channels** - Send the same analysis to multiple channels
✅ **Selective Broadcasting** - Choose exactly which channel receives the analysis
✅ **No Duplication Check** - You can resend to the same channel multiple times
✅ **Instant Delivery** - Messages are sent immediately
✅ **Full Formatting** - All charts, targets, and formatting preserved

## Common Use Cases

### 1. Cross-Posting
Send a high-value analysis to both your public channel (for exposure) and premium channel (for subscribers).

### 2. Testing
Test a new channel setup by resending an existing analysis instead of creating a new one.

### 3. Reposting
Share an old analysis again when market conditions are similar.

### 4. Multi-Tier Strategy
Send basic analysis to public → detailed breakdown to followers → exclusive insights to premium subscribers.

## Requirements

To use this feature:
1. You must be the author of the analysis
2. You must have at least one Telegram channel connected
3. The target channel must be enabled

## Setting Up Channels

If you don't have any channels connected:

1. Go to **Settings** → **Telegram**
2. Click **Connect New Channel**
3. Add your bot to the channel as an administrator
4. Configure the channel settings (audience type, notifications)
5. Save and enable the channel

See the full Telegram setup guide for detailed instructions.

## API Details

For developers integrating this feature:

### Endpoint
```
POST /api/analyses/{analysisId}/resend-to-channel
```

### Request Body
```json
{
  "channelId": "uuid-of-telegram-channel"
}
```

### Response (Success)
```json
{
  "success": true,
  "message": "Analysis sent to Premium Channel",
  "channelName": "Premium Channel"
}
```

### Response (Error)
```json
{
  "error": "Channel not found or access denied"
}
```

## Troubleshooting

### "No Telegram channels connected"
- Go to Settings → Telegram and connect at least one channel
- Make sure the channel is enabled

### "Channel not found or access denied"
- Verify the channel still exists in your Telegram account
- Check that your bot is still an administrator
- Refresh the channel list

### "Failed to send to channel"
- Check your bot token is still valid
- Verify the channel ID is correct
- Ensure the bot has permission to post messages

### Message not appearing in channel
- Check if the channel has "Silent messages" enabled
- Verify the bot wasn't removed from the channel
- Check Telegram API status

## Benefits

### For Analyzers
- **Time Saver**: Create once, send to multiple channels
- **Flexibility**: Test different channels with existing content
- **Revenue**: Different tiers can receive tailored content
- **Engagement**: Repost successful analyses when relevant

### For Subscribers
- **Consistent Content**: Same quality across channels
- **Value**: Premium tiers get exclusive insights
- **Timeliness**: Quick updates to all relevant channels

## Best Practices

1. **Don't Spam**: Avoid sending the same analysis to the same channel repeatedly
2. **Tier Appropriately**: Send basic info to public, details to premium
3. **Add Context**: Consider editing the analysis for different audiences before sending
4. **Test First**: Use a test channel before broadcasting to main channels
5. **Monitor Engagement**: Track which channels perform best

## Limitations

- You can only resend your own analyses
- The channel must be active and enabled
- The bot must have admin rights in the channel
- Rate limits apply (max ~20 messages/minute per bot)

## Future Enhancements

Planned features:
- [ ] Scheduled resending
- [ ] Bulk resend to multiple channels at once
- [ ] Analytics on which channels perform best
- [ ] Edit analysis before resending
- [ ] Channel-specific formatting templates

---

Need help? Check the Telegram Setup Guide or contact support.
