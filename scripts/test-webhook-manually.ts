import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testWebhookManually() {
  const webhookUrl = 'https://analyzhub.com/api/telegram/webhook';

  console.log('🧪 Testing webhook endpoint...\n');

  // Simulate a /help command update from Telegram
  const testUpdate = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: {
        id: 987654321,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: {
        id: 987654321,
        first_name: 'Test',
        username: 'testuser',
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text: '/help',
    },
  };

  try {
    console.log('Sending test /help command to webhook...\n');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUpdate),
    });

    const result = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Body:', JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log('\n✅ Webhook responded successfully!');
      console.log('This means your webhook endpoint is working.');
      console.log('\nPossible issues:');
      console.log('1. The bot token in admin_settings table might be different from .env');
      console.log('2. The bot might not have the necessary permissions');
      console.log('3. There might be an issue with the Telegram API connection');
    } else {
      console.log('\n❌ Webhook returned an error');
    }
  } catch (error) {
    console.error('\n❌ Error testing webhook:', error);
    console.log('\nThis might mean:');
    console.log('1. The webhook URL is not accessible');
    console.log('2. There are network/firewall issues');
    console.log('3. The application is not running');
  }
}

testWebhookManually();
