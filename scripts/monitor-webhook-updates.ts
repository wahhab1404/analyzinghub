import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function monitorUpdates() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found');
    process.exit(1);
  }

  console.log('👀 Monitoring for Telegram updates...');
  console.log('Note: Since webhook is active, getUpdates will return empty.');
  console.log('This is expected behavior.\n');

  let offset = 0;

  while (true) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=30`
      );

      const data = await response.json();

      if (data.ok && data.result.length > 0) {
        console.log(`\n📨 Received ${data.result.length} update(s):`);

        data.result.forEach((update: any) => {
          console.log('\n---');
          console.log('Update ID:', update.update_id);

          if (update.message) {
            console.log('From:', update.message.from.username || update.message.from.first_name);
            console.log('Chat ID:', update.message.chat.id);
            console.log('Text:', update.message.text);
          }

          offset = update.update_id + 1;
        });
      } else {
        process.stdout.write('.');
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('\n❌ Error:', error);
      break;
    }
  }
}

console.log('⚠️  NOTE: With an active webhook, Telegram will NOT send updates to getUpdates.');
console.log('This script is mainly for debugging webhook issues.\n');

monitorUpdates();
