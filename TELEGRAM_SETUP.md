# Telegram Notifications Setup Guide

This guide will help you set up Telegram notifications for AnalyzingHub. Analyzers can send instant notifications to traders when targets are hit or stop losses are triggered.

## Prerequisites

- A Telegram account
- AnalyzingHub account with analyzer role
- Admin access to create a Telegram bot

## Step 1: Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Start a conversation and send `/newbot`
3. Follow the prompts to:
   - Choose a name for your bot (e.g., "AnalyzingHub Alerts")
   - Choose a username for your bot (must end in 'bot', e.g., "AnalyzingHubBot")
4. BotFather will provide you with a **Bot Token**. Save this token securely.

Example response from BotFather:
```
Done! Congratulations on your new bot. You will find it at t.me/AnalyzingHubBot
You can now add a description, about section and profile picture for your bot.

Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

## Step 2: Configure Environment Variables

Add the following environment variables to your `.env` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_SECRET=your_random_secret_here

# Application Base URL (for links in messages)
APP_BASE_URL=https://yourdomain.com
```

### Generating a Webhook Secret

Generate a secure random string for the webhook secret:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 3: Set Up Telegram Webhook (Production)

To receive messages from users, you need to set up a webhook:

1. Replace the placeholders in the URL below:
   - `YOUR_BOT_TOKEN`: Your bot token from Step 1
   - `YOUR_DOMAIN`: Your production domain
   - `YOUR_WEBHOOK_SECRET`: The secret from Step 2

2. Open this URL in your browser or use curl:

```bash
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://YOUR_DOMAIN/api/telegram/webhook&secret_token=YOUR_WEBHOOK_SECRET
```

Example:
```bash
https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz/setWebhook?url=https://analyzinghub.com/api/telegram/webhook&secret_token=abc123def456
```

3. You should receive a response like:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

## Step 4: Verify Webhook Status

Check your webhook configuration:

```bash
https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

## Step 5: User Flow - Linking Telegram Accounts

### For Users (Traders):

1. Log in to AnalyzingHub
2. Go to **Settings → Telegram**
3. Click **Generate Link Code**
4. Copy the 8-character code (e.g., `ABC123XY`)
5. Open Telegram and search for your bot (e.g., `@AnalyzingHubBot`)
6. Start the bot and send:
   ```
   /start ABC123XY
   ```
7. The bot will confirm the linking with a success message
8. Return to AnalyzingHub settings to configure notification preferences

### Bot Commands

Users can interact with the bot using these commands:

- `/start <code>` - Link Telegram account using the code
- `/status` - Check if account is linked
- `/help` - Show available commands

## Step 6: Configure Notification Preferences

After linking, users can customize their Telegram notifications:

1. Go to **Settings → Notifications**
2. Scroll to the **Telegram Notifications** section
3. Configure the following:
   - **Enable Telegram Notifications**: Master switch
   - **Target Hit Notifications**: Get notified when targets are reached
   - **Stop Loss Notifications**: Get notified when stop losses are triggered
   - **New Analysis Notifications**: Get notified when followed analyzers post (optional)
   - **Quiet Hours**: Set hours when notifications should be muted

## Message Format

Telegram notifications are sent in both **English** and **Arabic**:

### Target Hit Example:
```
🎯 Target Hit!

Analyzer: John Doe
Symbol: BTC/USD
Target 2: $45,000.00

Target successfully reached!

View Analysis: [Link]

══════════

🎯 تم الوصول للهدف!

المحلل: John Doe
الرمز: BTC/USD
الهدف 2: $45,000.00

تم الوصول للهدف بنجاح!
```

### Stop Loss Example:
```
🛑 Stop Loss Hit

Analyzer: John Doe
Symbol: ETH/USD
Stop Price: $2,400.00

Stop loss has been triggered.

View Analysis: [Link]

══════════

🛑 تم الوصول لوقف الخسارة

المحلل: John Doe
الرمز: ETH/USD
سعر الوقف: $2,400.00

تم تفعيل وقف الخسارة.
```

## Rate Limiting & Throttling

The system includes built-in protection:

- **Rate Limit**: Maximum 10 messages per user per minute
- **Quiet Hours**: Notifications respect user-configured quiet hours
- **Deduplication**: Same event won't be sent twice

## Troubleshooting

### Bot Not Responding

1. Verify bot token is correct
2. Check webhook status using `getWebhookInfo`
3. Ensure webhook URL is accessible from Telegram servers
4. Check application logs for errors

### Notifications Not Being Received

1. Verify Telegram account is linked (Settings → Telegram)
2. Check notification preferences are enabled
3. Ensure not in quiet hours
4. Check rate limits haven't been exceeded
5. Review delivery logs in the database (`notification_delivery_log` table)

### Webhook Errors

Common issues:
- **Invalid SSL certificate**: Ensure your domain has a valid HTTPS certificate
- **Webhook URL not accessible**: Verify the URL is publicly accessible
- **Wrong secret token**: Ensure the secret matches between webhook setup and environment variable

### Testing the Setup

1. Create a test analysis as an analyzer
2. Set a target price close to the current price
3. Wait for the price validator to run (runs periodically)
4. Check if Telegram notification is received
5. Verify notification appears in delivery logs

## Security Considerations

1. **Keep bot token secure**: Never commit it to version control
2. **Use webhook secret**: Always validate incoming webhook requests
3. **RLS Policies**: Database has Row Level Security enabled
4. **Rate limiting**: Prevents abuse and excessive notifications
5. **User privacy**: Chat IDs are not exposed publicly

## Telegram Channel Broadcasting (For Analyzers)

Analyzers can connect their Telegram channels to automatically broadcast analysis updates to their subscribers.

### Channel Setup

1. Create a Telegram channel or use an existing one
2. Add `@AnalyzingHubBot` to your channel as an admin
3. Give the bot permission to post messages
4. Go to **Settings → Channel** in AnalyzingHub
5. Enter your channel username (e.g., @mychannel) or channel ID
6. Click **Connect** to verify and activate broadcasting

### Channel ID vs Username

You can connect using either:
- **Channel Username**: Public channels with usernames (e.g., `@mychannel`)
- **Channel ID**: Any channel's numeric ID (e.g., `-1001234567890`)

To find your channel ID:
1. Forward a message from your channel to `@userinfobot`
2. The bot will show you the channel ID

### Broadcasting Features

Analyzers can choose which events to broadcast:

1. **New Analysis** - Automatically post when publishing a new analysis
   - Includes symbol, direction, and entry price
   - Links to the full analysis on AnalyzingHub

2. **Target Hit** - Broadcast when a target is reached
   - Shows which target was hit and the price
   - Helps followers track progress

3. **Stop Loss Hit** - Alert when a stop loss is triggered
   - Notifies subscribers of stopped analyses
   - Transparent communication

### Broadcast Message Format

All broadcasts are sent in both English and Arabic:

**New Analysis Example:**
```
📊 New Analysis Published

Analyzer: John Doe
Symbol: BTC/USD
Direction: Long
Entry: $45,000.00

View Full Analysis: [Link]

══════════

📊 تحليل جديد

المحلل: John Doe
الرمز: BTC/USD
الاتجاه: Long
الدخول: $45,000.00
```

### Managing Your Channel

From Settings → Channel, you can:
- View connection status
- Enable/disable specific broadcast types
- Disconnect your channel
- See when the channel was connected

### Channel vs Personal Notifications

- **Personal Notifications**: Sent to individual traders who link their accounts
- **Channel Broadcasting**: Posted to your public/private channel for all subscribers

Both can be used simultaneously for maximum reach.

## Database Tables

The Telegram integration uses these tables:

- `telegram_accounts` - Links users to their Telegram chat IDs
- `telegram_channels` - Stores analyzer channel connections
- `telegram_link_codes` - Temporary codes for account linking
- `notification_delivery_log` - Tracks all notification deliveries
- `channel_broadcast_log` - Logs all channel broadcasts
- `notification_preferences` - Stores user notification settings

## Edge Functions

- `telegram-sender` - Sends notifications via Telegram Bot API
- `telegram-channel-broadcast` - Broadcasts to analyzer channels
- `price-validator` - Validates prices and triggers notifications

## API Endpoints

### Personal Notifications
- `POST /api/telegram/link-code` - Generate a linking code
- `POST /api/telegram/webhook` - Receive messages from Telegram
- `POST /api/telegram/disconnect` - Unlink Telegram account
- `GET /api/telegram/status` - Check connection status

### Channel Broadcasting (Analyzer Only)
- `GET /api/telegram/channel/status` - Check channel connection
- `POST /api/telegram/channel/connect` - Connect a channel
- `POST /api/telegram/channel/disconnect` - Disconnect channel
- `PATCH /api/telegram/channel/settings` - Update broadcast settings
- `POST /api/telegram/channel/broadcast-new-analysis` - Trigger manual broadcast

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review application logs
3. Verify environment variables are correctly set
4. Check Supabase Edge Functions logs

## Additional Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Telegram Bot Features](https://core.telegram.org/bots/features)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)
