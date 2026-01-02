import 'dotenv/config';

async function testBotHelp() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = 'https://analyzhub.com/api/telegram/webhook';

  console.log('Testing bot commands...\n');

  // Simulate a /help command from Telegram
  const helpUpdate = {
    update_id: 123456789,
    message: {
      message_id: 1,
      from: {
        id: 123456789,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: {
        id: 123456789,
        first_name: 'Test',
        username: 'testuser',
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text: '/help',
    },
  };

  console.log('Sending /help command to webhook:', webhookUrl);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(helpUpdate),
  });

  console.log('\nWebhook response status:', response.status);
  const result = await response.json();
  console.log('Webhook response:', JSON.stringify(result, null, 2));

  // Now check if the bot actually sent a message
  console.log('\nChecking bot updates...');
  const updatesResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getUpdates?limit=5`
  );
  const updatesResult = await updatesResponse.json();
  console.log('Recent updates:', JSON.stringify(updatesResult, null, 2));
}

testBotHelp().catch(console.error);
