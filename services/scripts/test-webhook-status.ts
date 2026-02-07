import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkWebhookStatus() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    process.exit(1);
  }

  console.log('🔍 Checking webhook status...\n');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );

    const data = await response.json();

    if (data.ok) {
      console.log('✅ Webhook Info:');
      console.log(JSON.stringify(data.result, null, 2));

      if (data.result.url) {
        console.log('\n✅ Webhook URL is set:', data.result.url);

        if (data.result.last_error_date) {
          console.log('\n⚠️  Last Error:');
          console.log('Time:', new Date(data.result.last_error_date * 1000).toLocaleString());
          console.log('Message:', data.result.last_error_message);
        } else {
          console.log('\n✅ No errors reported');
        }

        console.log('\n📊 Stats:');
        console.log('Pending updates:', data.result.pending_update_count);
        console.log('Max connections:', data.result.max_connections);

      } else {
        console.log('\n❌ No webhook URL is set!');
      }
    } else {
      console.error('❌ Failed to get webhook info:', data);
    }
  } catch (error) {
    console.error('❌ Error checking webhook status:', error);
  }
}

checkWebhookStatus();
