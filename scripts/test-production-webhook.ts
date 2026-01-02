import 'dotenv/config';

async function testProductionWebhook() {
  const productionWebhookUrl = 'https://analyzhub.com/api/telegram/webhook';

  const testUpdate = {
    update_id: 999999999,
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

  console.log('Testing production webhook...');
  console.log('URL:', productionWebhookUrl);
  console.log('Sending /help command\n');

  const response = await fetch(productionWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testUpdate),
  });

  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  const text = await response.text();
  console.log('\nResponse body:', text);

  try {
    const json = JSON.parse(text);
    console.log('\nParsed response:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON');
  }
}

testProductionWebhook().catch(console.error);
