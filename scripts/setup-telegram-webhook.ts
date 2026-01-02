/**
 * Telegram Webhook Setup Script
 *
 * This script registers the webhook with Telegram so the bot can receive messages.
 * Run this after deploying your application to production.
 *
 * Usage:
 *   npx tsx scripts/setup-telegram-webhook.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const botToken = process.env.TELEGRAM_BOT_TOKEN!;

async function setupWebhook() {
  console.log('🔧 Setting up Telegram webhook...\n');

  if (!botToken || botToken === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ TELEGRAM_BOT_TOKEN not configured in environment variables');
    process.exit(1);
  }

  // Get bot info
  const botInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const botInfo = await botInfoResponse.json();

  if (!botInfo.ok) {
    console.error('❌ Invalid bot token:', botInfo.description);
    process.exit(1);
  }

  console.log('✅ Bot info:');
  console.log(`   Username: @${botInfo.result.username}`);
  console.log(`   Name: ${botInfo.result.first_name}`);
  console.log('');

  // Get current webhook info
  const webhookInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const webhookInfo = await webhookInfoResponse.json();

  console.log('📋 Current webhook status:');
  if (webhookInfo.result.url) {
    console.log(`   URL: ${webhookInfo.result.url}`);
    console.log(`   Pending updates: ${webhookInfo.result.pending_update_count || 0}`);
    if (webhookInfo.result.last_error_date) {
      console.log(`   Last error: ${webhookInfo.result.last_error_message}`);
    }
  } else {
    console.log('   ⚠️  No webhook configured (using polling mode)');
  }
  console.log('');

  // Prompt for webhook URL
  console.log('🌐 Enter your webhook URL:');
  console.log('   Format: https://your-domain.com/api/telegram/webhook');
  console.log('   Example: https://analyzinghub.com/api/telegram/webhook');
  console.log('');
  console.log('   Note: Telegram requires HTTPS. Localhost URLs will not work.');
  console.log('');

  // For now, we'll just show instructions since we can't interactively prompt in this script
  console.log('To set up the webhook, run this command with your production URL:');
  console.log('');
  console.log('curl -X POST \\');
  console.log(`  "https://api.telegram.org/bot${botToken}/setWebhook" \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"url": "https://your-domain.com/api/telegram/webhook"}\'');
  console.log('');
  console.log('Or use this simpler version:');
  console.log('');
  console.log(`curl "https://api.telegram.org/bot${botToken}/setWebhook?url=https://your-domain.com/api/telegram/webhook"`);
  console.log('');

  // Check for deployed URL from Netlify or other platforms
  if (process.env.URL || process.env.DEPLOY_URL) {
    const deployUrl = process.env.URL || process.env.DEPLOY_URL;
    const webhookUrl = `${deployUrl}/api/telegram/webhook`;

    console.log('🚀 Detected deployment URL:', deployUrl);
    console.log('');
    console.log('Run this command to set up the webhook automatically:');
    console.log('');
    console.log(`curl "https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}"`);
    console.log('');
  }

  console.log('📝 After setting up the webhook:');
  console.log('   1. Open Telegram and search for @' + botInfo.result.username);
  console.log('   2. Send /start SE7A7CK7 (or your code) to link your account');
  console.log('   3. Check the webhook status by running this script again');
  console.log('');
}

setupWebhook().catch(console.error);
