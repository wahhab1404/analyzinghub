/**
 * Local Webhook Test
 *
 * This script tests the webhook endpoint locally by simulating a Telegram update.
 * Note: This only tests the endpoint logic, not actual Telegram integration.
 *
 * Usage:
 *   npm run dev (in another terminal)
 *   npx tsx scripts/test-webhook-locally.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

async function testWebhook() {
  console.log('🧪 Testing webhook endpoint locally...\n');

  const baseUrl = 'http://localhost:3000';
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  // Test 1: /start command without code
  console.log('Test 1: /start without code');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          message_id: 1,
          from: {
            id: 123456789,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: '/start',
        },
      }),
    });

    const result = await response.json();
    console.log('✅ Response:', result);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
  console.log('');

  // Test 2: /help command
  console.log('Test 2: /help command');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          message_id: 2,
          from: {
            id: 123456789,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: '/help',
        },
      }),
    });

    const result = await response.json();
    console.log('✅ Response:', result);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
  console.log('');

  // Test 3: /start with valid code
  console.log('Test 3: /start with code SE7A7CK7');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          message_id: 3,
          from: {
            id: 123456789,
            first_name: 'Test',
            username: 'testuser',
          },
          chat: {
            id: 123456789,
            type: 'private',
          },
          date: Math.floor(Date.now() / 1000),
          text: '/start SE7A7CK7',
        },
      }),
    });

    const result = await response.json();
    console.log('✅ Response:', result);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
  console.log('');

  console.log('📝 Note: This test simulates Telegram updates but cannot send actual');
  console.log('   Telegram messages. To test the full flow, deploy to production');
  console.log('   and use the real @AnalyzingHubBot on Telegram.');
  console.log('');
  console.log('💡 Next steps:');
  console.log('   1. Run: npm run build');
  console.log('   2. Deploy to Netlify');
  console.log('   3. Open Telegram and message @AnalyzingHubBot');
  console.log('   4. Send: /start SE7A7CK7');
}

testWebhook().catch(console.error);
