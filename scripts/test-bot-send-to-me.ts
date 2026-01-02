import 'dotenv/config';

async function testBotSend() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // To get your chat ID:
  // 1. Message @userinfobot on Telegram
  // 2. It will reply with your user info including your ID
  // 3. Replace the chatId below with your actual chat ID

  console.log('To test the bot sending messages:');
  console.log('1. Message @userinfobot on Telegram to get your chat ID');
  console.log('2. Then message @AnalyzingHubBot with /start');
  console.log('3. After you get your chat ID, update this script and run it again\n');

  // Uncomment and replace with your chat ID to test:
  // const yourChatId = 'YOUR_CHAT_ID_HERE';
  //
  // const response = await fetch(
  //   `https://api.telegram.org/bot${botToken}/sendMessage`,
  //   {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       chat_id: yourChatId,
  //       text: '✅ Test message from AnalyzingHub! The bot is working correctly.',
  //       parse_mode: 'HTML',
  //     }),
  //   }
  // );
  //
  // const result = await response.json();
  // console.log('Send result:', JSON.stringify(result, null, 2));

  // Test bot info instead
  const botInfoResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/getMe`
  );
  const botInfo = await botInfoResponse.json();

  console.log('Bot info:', JSON.stringify(botInfo, null, 2));

  if (botInfo.ok) {
    console.log('\n✅ Bot token is valid');
    console.log('Bot username:', botInfo.result.username);
    console.log('\nThe bot token is working correctly.');
    console.log('\nNext steps:');
    console.log('1. Try messaging the bot on Telegram: @' + botInfo.result.username);
    console.log('2. Send /start or /help');
    console.log('3. Check if you receive a response');
  } else {
    console.log('\n❌ Bot token is invalid');
  }
}

testBotSend().catch(console.error);
