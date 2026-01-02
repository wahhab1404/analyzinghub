# Telegram Integration Testing Guide

## Current Status

The Telegram webhook has been successfully configured and is now pointing to your production URL:
- **Webhook URL**: `https://anlzhub.com/api/telegram/webhook`
- **Bot Username**: `@AnalyzingHubBot`
- **Status**: Active and ready

## What Was Fixed

1. **Webhook Registration**: The bot now has a webhook registered with Telegram, allowing it to receive and respond to messages
2. **Environment Configuration**: Updated both `.env` and `netlify.toml` with correct credentials
3. **Production URL**: Set `APP_BASE_URL` to `https://anlzhub.com` for proper link generation

## Testing the Bot

### Step 1: Deploy to Production

Since the webhook requires HTTPS and points to your production domain, you need to deploy your changes:

```bash
npm run build
# Then deploy to Netlify (git push if using continuous deployment)
```

### Step 2: Link Your Account

1. Open Telegram and search for `@AnalyzingHubBot`
2. Send the command: `/start SE7A7CK7` (or generate a new code if this expired)
3. The bot should respond with a success message
4. Your Telegram account will be linked to your AnalyzingHub account

### Step 3: Generate a New Link Code (if needed)

If code `SE7A7CK7` has expired (codes expire after 10 minutes), generate a new one:

1. Log in to AnalyzingHub at `https://anlzhub.com`
2. Go to **Settings** → **Telegram**
3. Click **Generate Link Code**
4. Send `/start <YOUR_NEW_CODE>` to the bot

## Testing Notifications

Once your account is linked, test the following:

### 1. Test Personal Notifications

Create a test analysis and trigger these events:
- **New Analysis**: Create an analysis for a symbol you're following
- **Target Hit**: Price reaches a target (requires price monitoring to be active)
- **Stop Loss Hit**: Price hits the stop loss

### 2. Test Channel Broadcasting

If you have a Telegram channel:

1. Go to **Settings** → **Channel Settings**
2. Connect your channel
3. Create a new analysis
4. It should be automatically posted to your channel

## Available Bot Commands

- `/start <code>` - Link your account with a code from the app
- `/status` - Check if your account is linked
- `/help` - Show help message

## Webhook Management Commands

### Check Current Status
```bash
npm run telegram:status
```

### View Webhook Setup Instructions
```bash
npm run telegram:setup
```

### Manually Set Webhook (if needed)
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://anlzhub.com/api/telegram/webhook"
```

### Remove Webhook (for testing with polling)
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
```

## Troubleshooting

### Bot Not Responding

1. **Check webhook status**:
   ```bash
   npm run telegram:status
   ```

2. **Verify the webhook URL is correct**:
   - Should be: `https://anlzhub.com/api/telegram/webhook`
   - Must be HTTPS
   - Must be publicly accessible

3. **Check for errors**:
   - Look at Netlify function logs
   - Check Supabase logs
   - Run the status command to see if Telegram reports any errors

### Code Already Used or Expired

Generate a new code from the app:
1. Settings → Telegram → Generate Link Code
2. Use the new code within 10 minutes

### Notifications Not Working

1. **Check account is linked**:
   ```sql
   SELECT * FROM telegram_accounts WHERE user_id = '<your-user-id>';
   ```

2. **Check notification preferences**:
   ```sql
   SELECT * FROM notification_preferences WHERE user_id = '<your-user-id>';
   ```

3. **Verify bot token is configured**:
   - Check in Netlify environment variables
   - Verify in `admin_settings` table

### Channel Broadcasting Not Working

1. **Verify channel is connected**:
   ```sql
   SELECT * FROM telegram_channels WHERE user_id = '<your-user-id>';
   ```

2. **Check broadcasting is enabled**:
   - Go to Settings → Channel Settings
   - Ensure "Notify on New Analysis" is enabled

3. **Verify bot has admin access to the channel**

## Production Checklist

Before going live, ensure:

- [ ] Webhook is configured and pointing to production URL
- [ ] TELEGRAM_BOT_TOKEN is set in Netlify environment variables
- [ ] SUPABASE_SERVICE_ROLE_KEY is correctly configured
- [ ] APP_BASE_URL is set to `https://anlzhub.com`
- [ ] Bot has been tested with `/start` command
- [ ] Notifications are working
- [ ] Channel broadcasting is working (if applicable)

## Security Notes

1. **Never commit sensitive tokens** to your repository
2. **Use environment variables** for all sensitive configuration
3. **Keep your bot token secret** - it provides full control of your bot
4. **Webhook secret** (optional): Consider adding a webhook secret for additional security

## Support

If you continue to experience issues:

1. Check the webhook status: `npm run telegram:status`
2. Review Netlify function logs
3. Check Supabase logs for any database errors
4. Verify all environment variables are correctly set
