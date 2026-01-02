import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function fullWebhookTest() {
  const webhookUrl = 'https://analyzhub.com/api/telegram/webhook';
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  console.log('🧪 Full webhook test...\n');

  // Simulate exactly what Telegram sends
  const telegramUpdate = {
    update_id: 999999999,
    message: {
      message_id: 1,
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'TestUser',
        username: 'testuser',
        language_code: 'en',
      },
      chat: {
        id: 123456789,
        first_name: 'TestUser',
        username: 'testuser',
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text: '/help',
    },
  };

  console.log('Sending /help command...\n');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TelegramBot',
      },
      body: JSON.stringify(telegramUpdate),
    });

    const result = await response.json();

    console.log('✅ Webhook Response:');
    console.log('   Status:', response.status);
    console.log('   Body:', JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log('\n✅ Webhook accepted the request');

      // Now check if a message was actually sent back to Telegram
      console.log('\nℹ️  The webhook handler should have called sendMessage to Telegram API');
      console.log('   If the bot is not responding, the issue is likely in the sendMessage function');
console.log('\nDebugging steps:');
      console.log('1. Check server logs at https://app.netlify.com (if deployed on Netlify)');
      console.log('2. Check that TELEGRAM_BOT_TOKEN is in the deployment environment');
      console.log('3. Check if sendTelegramMessage is being called');
      console.log('4. Verify the bot token has permission to send messages');

      // Test if we can send a message directly
      console.log('\n🔍 Testing direct message send...');
      const directSendUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

      const directResponse = await fetch(directSendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: 123456789,
          text: 'Test message',
        }),
      });

      const directResult = await directResponse.json();

      if (directResult.ok) {
        console.log('✅ Direct send works!');
      } else {
        console.log('❌ Direct send failed:', directResult.description);
        if (directResult.description.includes('chat not found')) {
          console.log('\n💡 This is expected - the test chat ID doesn\'t exist.');
          console.log('   The bot CAN send messages, so the issue must be in the webhook handler.');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fullWebhookTest();
