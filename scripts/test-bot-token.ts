import 'dotenv/config';

async function testBotToken() {
  console.log('=== Testing Telegram Bot Token ===\n');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
    return;
  }

  console.log('Bot Token (first 15 chars):', botToken.substring(0, 15) + '...');
  console.log('');

  // Test with getMe endpoint
  console.log('Testing bot token with getMe...');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`,
      { method: 'GET' }
    );

    const result = await response.json();

    if (result.ok) {
      console.log('✅ Bot token is valid!');
      console.log('');
      console.log('Bot Info:');
      console.log('  Username:', '@' + result.result.username);
      console.log('  Name:', result.result.first_name);
      console.log('  ID:', result.result.id);
      console.log('  Can Join Groups:', result.result.can_join_groups);
      console.log('  Can Read Messages:', result.result.can_read_all_group_messages);
    } else {
      console.log('❌ Bot token is INVALID!');
      console.log('Error:', result);
      console.log('');
      console.log('Possible reasons:');
      console.log('1. Token was revoked by @BotFather');
      console.log('2. Token is incorrect or malformed');
      console.log('3. Bot was deleted');
      console.log('');
      console.log('To fix:');
      console.log('1. Go to @BotFather on Telegram');
      console.log('2. Send /mybots');
      console.log('3. Select your bot');
      console.log('4. Click "API Token" to get a new token');
      console.log('5. Update TELEGRAM_BOT_TOKEN in .env file');
    }
  } catch (err: any) {
    console.error('❌ Network error:', err.message);
  }
}

testBotToken().catch(console.error);
