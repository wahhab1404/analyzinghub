import 'dotenv/config';

async function testDirectSend() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // This is a test chat ID - you'll need to replace this with your actual chat ID
  // You can get your chat ID by messaging @userinfobot on Telegram
  console.log('Bot token:', botToken ? `${botToken.substring(0, 10)}...` : 'NOT FOUND');

  console.log('\nTo test if the bot can send messages:');
  console.log('1. Get your Telegram chat ID by messaging @userinfobot');
  console.log('2. Replace TEST_CHAT_ID below with your actual chat ID');
  console.log('3. Run this script again\n');

  // Uncomment and replace with your chat ID to test
  // const chatId = 'YOUR_CHAT_ID_HERE';
  // const response = await fetch(
  //   `https://api.telegram.org/bot${botToken}/sendMessage`,
  //   {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       chat_id: chatId,
  //       text: 'Test message from AnalyzingHub bot!',
  //     }),
  //   }
  // );
  // const result = await response.json();
  // console.log('Result:', JSON.stringify(result, null, 2));
}

testDirectSend().catch(console.error);
