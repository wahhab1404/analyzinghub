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

async function getBotInfo() {
  console.log('🤖 Fetching Telegram Bot Information...\n');

  const botToken = await getBotToken();

  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not found in environment or database');
    process.exit(1);
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`
    );

    const result = await response.json();

    if (result.ok && result.result) {
      const bot = result.result;

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🤖 Bot Information:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`ID: ${bot.id}`);
      console.log(`Name: ${bot.first_name}`);
      console.log(`Username: @${bot.username}`);
      console.log(`Can Join Groups: ${bot.can_join_groups ? 'Yes' : 'No'}`);
      console.log(`Can Read Messages: ${bot.can_read_all_group_messages ? 'Yes' : 'No'}`);
      console.log(`Supports Inline: ${bot.supports_inline_queries ? 'Yes' : 'No'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n✅ Bot Link: https://t.me/${bot.username}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.error('❌ Failed to get bot info:', result);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error fetching bot info:', error);
    process.exit(1);
  }
}

getBotInfo();
