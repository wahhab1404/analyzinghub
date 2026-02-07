# Telegram Bot Setup Instructions

## What I've Fixed

1. **Updated Edge Functions** - All Telegram edge functions now use the correct URL `https://anlzhub.com` instead of bolt.new
2. **Public Analysis View** - The share pages now have professional styling and work correctly
3. **Market Status** - Stock prices now show accurate market status (Open/Closed/Pre-Market/After-Hours)

## What You Need to Do Manually

### Step 1: Configure Telegram Webhook

The Telegram bot needs a webhook configured to receive messages. Run this command (replace <YOUR_BOT_TOKEN> with your actual bot token):

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://anlzhub.com/api/telegram/webhook",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Step 2: Verify Webhook Status

Check if the webhook is configured correctly (replace <YOUR_BOT_TOKEN> with your actual bot token):

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

**Expected Response:**
```json
{
  "ok": true,
  "result": {
    "url": "https://anlzhub.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40
  }
}
```

### Step 3: Test the Bot

1. Open Telegram and search for your bot: `@YourBotUsername`
2. Send `/start` command
3. The bot should respond with a welcome message
4. Send `/help` to see available commands
5. Send `/status` to check connection status

### Step 4: Link Your Account

1. Go to your app: `https://anlzhub.com/dashboard/settings`
2. Navigate to the Telegram settings tab
3. Click "Generate Link Code"
4. Copy the code
5. In Telegram, send to your bot: `/start YOUR_CODE_HERE`
6. The bot should confirm the link was successful

### Step 5: Configure Telegram Channel (For Analyzers)

If you're an analyzer who wants to broadcast to a Telegram channel:

1. Create a public or private Telegram channel
2. Add your bot as an administrator to the channel with "Post Messages" permission
3. In the app, go to Settings → Channel Settings
4. Enter your channel ID or username (e.g., `@yourchannel` or `-1001234567890`)
5. Configure which events to broadcast (new analysis, target hit, stop loss hit)
6. Choose the broadcast language (English, Arabic, or Both)

### Step 6: Get Channel ID (If Needed)

To get your channel ID:

1. Add the bot to your channel as admin
2. Post any message in the channel
3. Visit: `https://api.telegram.org/bot8311641714:AAEHICOt6JMscx0o2BFYkoiCwqQwKht6cag/getUpdates`
4. Look for `"chat":{"id":-1001234567890}` in the response
5. Use that ID in the app settings

## Testing Notifications

### Test User Notifications

1. Link your Telegram account as described above
2. Create a test analysis in the app
3. Enable Telegram notifications in Settings → Notifications
4. You should receive a notification when:
   - Someone you follow posts new analysis
   - A target price is hit
   - A stop loss is triggered

### Test Channel Broadcasts

1. Configure your Telegram channel as described above
2. Create a new analysis post
3. The post should automatically broadcast to your channel with:
   - Professional formatting
   - Links to view full analysis on anlzhub.com
   - Chart image (if uploaded)
   - All analysis details (targets, stop loss, direction)

## Troubleshooting

### Bot Not Responding

1. Verify webhook is set correctly (Step 1 & 2)
2. Check bot token is correct in `.env` file
3. Try removing and re-adding the webhook

### No Notifications Received

1. Check Telegram is linked in Settings → Telegram
2. Verify notifications are enabled in Settings → Notifications
3. Check notification preferences (target hit, stop hit, new analysis)
4. Ensure you're not in quiet hours

### Channel Broadcasts Not Working

1. Verify bot is admin in the channel with "Post Messages" permission
2. Check channel ID is correct (use Step 6)
3. Ensure channel is enabled in Settings → Channel Settings
4. Verify broadcast events are enabled (new analysis, etc.)

### Links Going to Wrong URL

All links should now go to `https://anlzhub.com`. If you see bolt.new:
1. Refresh the page
2. Clear browser cache
3. The edge functions have been updated

## Public Share Links

Analysis can now be shared publicly with beautiful, professional views:

- **Format**: `https://anlzhub.com/share/{analysis-id}`
- **Language Support**: Add `?lang=ar` for Arabic or `?lang=en` for English
- **Features**:
  - Professional styling with gradient headers
  - Live price data with market status
  - Full analysis details
  - Social sharing buttons
  - Download options for charts and snapshots
  - Call-to-action for non-users to sign up

**Example Share Links:**
- English: `https://anlzhub.com/share/abc123?lang=en`
- Arabic: `https://anlzhub.com/share/abc123?lang=ar`

## Support

If you encounter any issues:

1. Check the webhook status using Step 2
2. Review the troubleshooting section above
3. Check browser console for any errors
4. Verify all settings are configured correctly

## Summary

- **Webhook URL**: `https://anlzhub.com/api/telegram/webhook`
- **Bot Token**: Already configured in environment variables
- **Share URL Format**: `https://anlzhub.com/share/{id}`
- **All edge functions updated**: Using correct URLs
- **Public views**: Professional styling ready for sharing
