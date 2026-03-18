/**
 * setup-bot-menu.ts
 *
 * Registers Telegram bot commands for both English and Arabic interfaces.
 * Run once after deployment or after changing the command list.
 *
 * Usage:
 *   npx ts-node -e "require('./scripts/setup-bot-menu')"
 *   or:
 *   TELEGRAM_BOT_TOKEN=xxx npx ts-node scripts/setup-bot-menu.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function getBotToken(): Promise<string | null> {
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'telegram_bot_token')
      .maybeSingle();

    if (data?.setting_value && data.setting_value !== 'YOUR_BOT_TOKEN_HERE') {
      return data.setting_value;
    }
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken && envToken !== 'YOUR_BOT_TOKEN_HERE') return envToken;
  return null;
}

// ─── Command Definitions ──────────────────────────────────────────────────────

const EN_COMMANDS = [
  { command: 'start',   description: 'Welcome screen & main menu' },
  { command: 'menu',    description: 'Open the main menu' },
  { command: 'help',    description: 'Help center & how-to guide' },
  { command: 'status',  description: 'Check your account link status' },
];

const AR_COMMANDS = [
  { command: 'start',   description: 'شاشة الترحيب والقائمة الرئيسية' },
  { command: 'menu',    description: 'فتح القائمة الرئيسية' },
  { command: 'help',    description: 'مركز المساعدة' },
  { command: 'status',  description: 'التحقق من حالة ربط الحساب' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setCommands(
  token:     string,
  commands:  Array<{ command: string; description: string }>,
  langCode?: string
): Promise<boolean> {
  const body: any = { commands };
  if (langCode) {
    body.language_code = langCode;
    body.scope = { type: 'all_private_chats' };
  }

  const res    = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const result = await res.json();
  return result.ok === true;
}

async function setBotDescription(token: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      description: 'AnalyzingHub AI Market Intelligence Bot\n\n' +
                   'Access AI-powered financial analysis, technical analysis, platform search, trades, and reports — in a premium bilingual experience.',
    }),
  });

  await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      description: 'بوت الذكاء الاصطناعي لتحليل الأسواق — AnalyzingHub\n\n' +
                   'احصل على تحليل مالي وفني بالذكاء الاصطناعي، البحث في المنصة، الصفقات، والتقارير — بتجربة احترافية ثنائية اللغة.',
      language_code: 'ar',
    }),
  });
}

async function setBotShortDescription(token: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      short_description: 'AI-powered market intelligence — financial analysis, technical analysis, trades & reports.',
    }),
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🤖  AnalyzingHub — Telegram Bot Setup\n');
  console.log('━'.repeat(40));

  const token = await getBotToken();
  if (!token) {
    console.error('❌  TELEGRAM_BOT_TOKEN not found in environment or database.');
    process.exit(1);
  }
  console.log('✅  Bot token retrieved\n');

  // Verify bot
  const meRes  = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meData = await meRes.json();
  if (!meData.ok) {
    console.error('❌  Invalid bot token:', meData);
    process.exit(1);
  }
  console.log(`🤖  Bot: @${meData.result.username} (${meData.result.first_name})\n`);

  // English commands (default)
  console.log('📝  Setting English commands…');
  const enOk = await setCommands(token, EN_COMMANDS);
  console.log(enOk ? '✅  English commands set' : '❌  Failed to set English commands');
  EN_COMMANDS.forEach(c => console.log(`     /${c.command}  —  ${c.description}`));
  console.log('');

  // Arabic commands
  console.log('📝  Setting Arabic commands…');
  const arOk = await setCommands(token, AR_COMMANDS, 'ar');
  console.log(arOk ? '✅  Arabic commands set' : '❌  Failed to set Arabic commands');
  AR_COMMANDS.forEach(c => console.log(`     /${c.command}  —  ${c.description}`));
  console.log('');

  // Bot description
  console.log('📝  Setting bot description…');
  await setBotDescription(token);
  await setBotShortDescription(token);
  console.log('✅  Description set\n');

  console.log('━'.repeat(40));
  console.log('🎉  Bot setup complete!');
  console.log('');
  console.log('💡  Next steps:');
  console.log('     1. Ensure NEXT_PUBLIC_BASE_URL is set correctly');
  console.log('     2. Ensure OPENAI_API_KEY is configured');
  console.log('     3. Run the bot_sessions migration in Supabase');
  console.log('     4. Run the ai_analysis_results migration in Supabase');
  console.log('     5. Test by sending /start to the bot');
  console.log('━'.repeat(40));
  console.log('');
}

main().catch(err => {
  console.error('❌  Setup failed:', err);
  process.exit(1);
});
