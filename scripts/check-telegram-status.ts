/**
 * Check Telegram Bot Status
 *
 * This script checks the current status of the Telegram bot and webhook.
 *
 * Usage:
 *   npx tsx scripts/check-telegram-status.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

const botToken = process.env.TELEGRAM_BOT_TOKEN!;

async function checkStatus() {
  if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ TELEGRAM_BOT_TOKEN not configured');
    process.exit(1);
  }

  console.log('🔍 Checking Telegram bot status...\n');

  // Get bot info
  const botInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const botInfo = await botInfoResponse.json();

  if (!botInfo.ok) {
    console.error('❌ Invalid bot token');
    process.exit(1);
  }

  console.log('🤖 Bot Information:');
  console.log(`   Username: @${botInfo.result.username}`);
  console.log(`   Name: ${botInfo.result.first_name}`);
  console.log(`   ID: ${botInfo.result.id}`);
  console.log('');

  // Get webhook info
  const webhookInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const webhookInfo = await webhookInfoResponse.json();

  console.log('🌐 Webhook Status:');
  if (webhookInfo.result.url) {
    console.log(`   ✅ URL: ${webhookInfo.result.url}`);
    console.log(`   📊 Pending updates: ${webhookInfo.result.pending_update_count || 0}`);
    console.log(`   🔄 Max connections: ${webhookInfo.result.max_connections || 40}`);

    if (webhookInfo.result.last_error_date) {
      console.log(`   ❌ Last error (${new Date(webhookInfo.result.last_error_date * 1000).toISOString()}):`);
      console.log(`      ${webhookInfo.result.last_error_message}`);
    } else {
      console.log('   ✅ No errors');
    }

    if (webhookInfo.result.last_synchronization_error_date) {
      console.log(`   ⚠️  Last sync error: ${new Date(webhookInfo.result.last_synchronization_error_date * 1000).toISOString()}`);
    }
  } else {
    console.log('   ⚠️  No webhook configured');
    console.log('   ℹ️  Bot is not receiving updates');
    console.log('');
    console.log('   To set up webhook, run:');
    console.log('   npm run setup-telegram-webhook');
  }
  console.log('');

  // Get recent updates
  const updatesResponse = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=5`);
  const updates = await updatesResponse.json();

  if (updates.ok && updates.result.length > 0) {
    console.log('📬 Recent Messages (last 5):');
    updates.result.forEach((update: any, index: number) => {
      const msg = update.message || update.edited_message;
      if (msg) {
        console.log(`   ${index + 1}. From: ${msg.from?.username || msg.from?.first_name || 'Unknown'}`);
        console.log(`      Text: ${msg.text || '(no text)'}`);
        console.log(`      Date: ${new Date(msg.date * 1000).toISOString()}`);
      }
    });
  } else {
    console.log('📬 No recent messages');
  }
  console.log('');

  console.log('💡 Next Steps:');
  if (!webhookInfo.result.url) {
    console.log('   1. Deploy your application to production');
    console.log('   2. Run: npm run setup-telegram-webhook');
    console.log('   3. Set the webhook URL to: https://your-domain.com/api/telegram/webhook');
  } else {
    console.log('   1. Open Telegram and search for @' + botInfo.result.username);
    console.log('   2. Send /start <your-code> to link your account');
    console.log('   3. Check Settings → Telegram in the app for your link code');
  }
  console.log('');
}

checkStatus().catch(console.error);
