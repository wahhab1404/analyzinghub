import 'dotenv/config';

async function checkWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  console.log('Checking webhook configuration...\n');

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`
  );

  const result = await response.json();

  console.log('Webhook Info:');
  console.log(JSON.stringify(result, null, 2));

  if (result.ok && result.result) {
    const info = result.result;
    console.log('\n===== WEBHOOK STATUS =====');
    console.log('URL:', info.url || 'NOT SET');
    console.log('Has custom certificate:', info.has_custom_certificate);
    console.log('Pending update count:', info.pending_update_count);
    console.log('Max connections:', info.max_connections);
    console.log('IP address:', info.ip_address || 'N/A');

    if (info.last_error_date) {
      console.log('\n⚠️  LAST ERROR:');
      console.log('Time:', new Date(info.last_error_date * 1000).toISOString());
      console.log('Message:', info.last_error_message);
    } else {
      console.log('\n✅ No errors');
    }

    if (info.last_synchronization_error_date) {
      console.log('\n⚠️  LAST SYNC ERROR:');
      console.log('Time:', new Date(info.last_synchronization_error_date * 1000).toISOString());
    }
  }
}

checkWebhook().catch(console.error);
