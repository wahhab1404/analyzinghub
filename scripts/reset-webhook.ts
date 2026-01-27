import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function resetWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const webhookUrl = `${process.env.APP_BASE_URL}/api/telegram/webhook`;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found');
    process.exit(1);
  }

  if (!webhookSecret) {
    console.error('❌ TELEGRAM_WEBHOOK_SECRET not found');
    process.exit(1);
  }

  console.log('🔄 Resetting webhook with secret token...\n');
  console.log('🔐 Secret:', webhookSecret);

  try {
    // Step 1: Delete existing webhook
    console.log('1. Deleting existing webhook...');
    const deleteResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`
    );
    const deleteResult = await deleteResponse.json();
    console.log('   Result:', deleteResult.description);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Set new webhook
    console.log('\n2. Setting new webhook...');
    console.log('   URL:', webhookUrl);

    const setResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
          max_connections: 40,
        }),
      }
    );

    const setResult = await setResponse.json();

    if (setResult.ok) {
      console.log('   ✅', setResult.description);
    } else {
      console.log('   ❌ Failed:', setResult.description);
      return;
    }

    // Step 3: Verify
    console.log('\n3. Verifying webhook...');
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    const info = await infoResponse.json();

    console.log('\n📊 Webhook Info:');
    console.log('   URL:', info.result.url);
    console.log('   Pending updates:', info.result.pending_update_count);
    console.log('   Max connections:', info.result.max_connections);

    if (info.result.last_error_date) {
      console.log('\n   ⚠️  Last Error:');
      console.log('   Time:', new Date(info.result.last_error_date * 1000).toLocaleString());
      console.log('   Message:', info.result.last_error_message);
    }

    console.log('\n✅ Webhook reset complete!');
    console.log('\n💡 Now try:');
    console.log('   1. Open Telegram');
    console.log('   2. Search for @AnalyzingHubBot');
    console.log('   3. Send /start');
    console.log('   4. Wait for response');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetWebhook();
