import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function getBotToken(): Promise<string | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'telegram_bot_token')
    .maybeSingle();

  if (data?.setting_value && data.setting_value !== 'YOUR_BOT_TOKEN_HERE') {
    return data.setting_value;
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken && envToken !== 'YOUR_BOT_TOKEN_HERE') {
    return envToken;
  }

  return null;
}

async function setupBotMenu() {
  console.log('🤖 Setting up Telegram Bot Menu...\n');

  const botToken = await getBotToken();

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in environment or database');
    process.exit(1);
  }

  console.log('✅ Bot token retrieved\n');

  const commands = [
    {
      command: 'start',
      description: 'Link your account and get started'
    },
    {
      command: 'help',
      description: 'Show help menu with all features'
    },
    {
      command: 'menu',
      description: 'Display the bot menu'
    },
    {
      command: 'status',
      description: 'Check if your account is linked'
    }
  ];

  const arabicCommands = [
    {
      command: 'start',
      description: 'ربط حسابك والبدء'
    },
    {
      command: 'help',
      description: 'عرض قائمة المساعدة مع جميع المميزات'
    },
    {
      command: 'menu',
      description: 'عرض قائمة البوت'
    },
    {
      command: 'status',
      description: 'التحقق من ربط حسابك'
    }
  ];

  try {
    console.log('📝 Setting up default (English) commands...');
    const defaultResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setMyCommands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands })
      }
    );

    const defaultResult = await defaultResponse.json();

    if (defaultResult.ok) {
      console.log('✅ Default commands set successfully\n');
      console.log('Commands:');
      commands.forEach(cmd => {
        console.log(`  /${cmd.command} - ${cmd.description}`);
      });
      console.log('');
    } else {
      console.error('❌ Failed to set default commands:', defaultResult);
      process.exit(1);
    }

    console.log('📝 Setting up Arabic commands...');
    const arabicResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/setMyCommands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: arabicCommands,
          language_code: 'ar'
        })
      }
    );

    const arabicResult = await arabicResponse.json();

    if (arabicResult.ok) {
      console.log('✅ Arabic commands set successfully\n');
      console.log('الأوامر:');
      arabicCommands.forEach(cmd => {
        console.log(`  /${cmd.command} - ${cmd.description}`);
      });
      console.log('');
    } else {
      console.error('❌ Failed to set Arabic commands:', arabicResult);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Bot menu setup complete!');
    console.log('');
    console.log('🎯 Users will now see the menu when they type "/" in your bot');
    console.log('');
    console.log('💡 Test it out:');
    console.log('  1. Open your Telegram bot');
    console.log('  2. Type "/"');
    console.log('  3. You should see the commands menu');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error setting up bot menu:', error);
    process.exit(1);
  }
}

setupBotMenu();
