# Telegram Bot Fix Instructions

The Telegram bot requires proper webhook setup in production. Follow these steps:

## 1. Verify Bot Token is Set

In Netlify, ensure this environment variable is configured:
```
TELEGRAM_BOT_TOKEN=your_actual_bot_token
```

## 2. Set Up Webhook in Production

After deployment, run this command to set the webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://anlzhub.com/api/telegram/webhook",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token.

## 3. Verify Webhook Status

Check if the webhook is properly set:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

You should see:
```json
{
  "ok": true,
  "result": {
    "url": "https://anlzhub.com/api/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## 4. Test the Bot

1. Open Telegram and search for your bot
2. Send `/start` - You should receive a welcome message
3. Send `/help` - You should receive help information
4. Send `/status` - You should receive status information

## 5. Link Your Account

1. In the AnalyzingHub web app, go to Settings → Telegram
2. Click "Generate Link Code"
3. Copy the code
4. In Telegram, send: `/start YOUR_CODE`
5. The bot should confirm the link

## Common Issues

### Bot Not Responding
- **Check webhook URL**: Make sure it's set to `https://anlzhub.com/api/telegram/webhook`
- **Check bot token**: Verify it's correctly set in Netlify environment variables
- **Check logs**: In Netlify, check the function logs for errors

### "Invalid Secret" Error
- The webhook route checks for `TELEGRAM_WEBHOOK_SECRET` if set
- Either set this variable or remove the check temporarily

### Database Connection Issues
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Netlify

## Production Webhook Setup Script

You can also use this Node.js script:

```javascript
const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN';
const WEBHOOK_URL = 'https://anlzhub.com/api/telegram/webhook';

fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: WEBHOOK_URL,
    allowed_updates: ['message'],
    drop_pending_updates: true
  })
})
.then(res => res.json())
.then(data => console.log('Webhook setup result:', data))
.catch(err => console.error('Error:', err));
```

## Verify Production Environment Variables

In Netlify Dashboard → Site Settings → Environment Variables, ensure these are set:

1. `TELEGRAM_BOT_TOKEN` - Your bot token from BotFather
2. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
3. `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
4. `NEXT_PUBLIC_APP_URL` - https://anlzhub.com

## Testing

After setup, test with these commands:
- `/start` - Should respond with welcome message
- `/help` - Should show command list
- `/status` - Should show connection status
- `/start CODE123` - Should link account (use code from web app)
