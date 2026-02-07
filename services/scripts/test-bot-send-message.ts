import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testBotSendMessage() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in .env file');
    process.exit(1);
  }

  console.log('🧪 Testing bot send message capability...\n');

  // First, let's get the bot info
  try {
    console.log('1. Getting bot info...');
    const botInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    );
    const botInfo = await botInfoResponse.json();

    if (botInfo.ok) {
      console.log('✅ Bot Info:');
      console.log('   Username:', '@' + botInfo.result.username);
      console.log('   Name:', botInfo.result.first_name);
      console.log('   ID:', botInfo.result.id);
    } else {
      console.log('❌ Failed to get bot info:', botInfo);
      return;
    }

    // Get recent updates to find your chat ID
    console.log('\n2. Checking for recent messages...');
    const updatesResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates`
    );
    const updates = await updatesResponse.json();

    if (updates.ok && updates.result.length > 0) {
      console.log('✅ Found recent messages:');

      const recentChats = new Set();
      updates.result.forEach((update: any) => {
        if (update.message?.chat?.id) {
          recentChats.add(update.message.chat.id);
        }
      });

      console.log('   Chat IDs:', Array.from(recentChats).join(', '));

      // Try to send a message to the most recent chat
      const latestUpdate = updates.result[updates.result.length - 1];
      if (latestUpdate.message?.chat?.id) {
        const chatId = latestUpdate.message.chat.id;
        console.log('\n3. Sending test message to chat:', chatId);

        const sendResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: '🧪 This is a test message from the bot!\n\nIf you see this, the bot is working correctly.',
              parse_mode: 'HTML',
            }),
          }
        );

        const sendResult = await sendResponse.json();

        if (sendResult.ok) {
          console.log('✅ Message sent successfully!');
          console.log('   Message ID:', sendResult.result.message_id);
        } else {
          console.log('❌ Failed to send message:', sendResult);
        }
      }
    } else {
      console.log('❌ No recent messages found.');
      console.log('\n💡 To test:');
      console.log('   1. Open Telegram');
      console.log('   2. Search for your bot: @' + botInfo.result.username);
      console.log('   3. Send /start or any message');
      console.log('   4. Run this script again');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testBotSendMessage();
