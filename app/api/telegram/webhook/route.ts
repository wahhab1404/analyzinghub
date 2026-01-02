import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Telegram Webhook] Missing environment variables:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey
    });
    return NextResponse.json({ ok: true });
  }

  try {
    console.log('[Telegram Webhook] Received update');

    const webhookSecret = request.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && webhookSecret !== expectedSecret) {
      console.log('[Telegram Webhook] Invalid secret');
      return NextResponse.json({ ok: false, error: 'Invalid secret' }, { status: 401 });
    }

    const update = await request.json();
    console.log('[Telegram Webhook] Update data:', JSON.stringify(update, null, 2));

    // Handle /start command with code
    if (update.message?.text?.startsWith('/start')) {
      console.log('[Telegram Webhook] Processing /start command');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const chatId = update.message.chat.id.toString();
      const username = update.message.from.username;
      const text = update.message.text;
      const parts = text.split(' ');

      console.log('[Telegram Webhook] Chat ID:', chatId, 'Username:', username, 'Parts:', parts);

      if (parts.length < 2) {
        console.log('[Telegram Webhook] No code provided, sending welcome message');
        await sendTelegramMessage(
          chatId,
          'Welcome to AnalyzingHub! 🎯\n\n' +
          'To link your account:\n' +
          '1. Log in to AnalyzingHub\n' +
          '2. Go to Settings → Telegram\n' +
          '3. Generate a link code\n' +
          '4. Send /start <code> to me\n\n' +
          'مرحباً بك في AnalyzingHub! 🎯\n\n' +
          'لربط حسابك:\n' +
          '1. سجل الدخول إلى AnalyzingHub\n' +
          '2. اذهب إلى الإعدادات ← تيليجرام\n' +
          '3. أنشئ رمز الربط\n' +
          '4. أرسل /start <الرمز> إلي',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      const code = parts[1].toUpperCase();

      // Find the code and user
      const { data: linkCode, error: codeError } = await supabase
        .from('telegram_link_codes')
        .select('user_id, used_at, expires_at')
        .eq('code', code)
        .maybeSingle();

      if (codeError || !linkCode) {
        await sendTelegramMessage(
          chatId,
          '❌ Invalid code. Please generate a new code from the app.\n\n' +
          '❌ رمز غير صالح. يرجى إنشاء رمز جديد من التطبيق.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Check if already used
      if (linkCode.used_at) {
        await sendTelegramMessage(
          chatId,
          '❌ This code has already been used.\n\n' +
          '❌ تم استخدام هذا الرمز بالفعل.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Check if expired
      if (new Date(linkCode.expires_at) < new Date()) {
        await sendTelegramMessage(
          chatId,
          '❌ This code has expired. Please generate a new one.\n\n' +
          '❌ انتهت صلاحية هذا الرمز. يرجى إنشاء رمز جديد.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Check if user already has a linked account
      const { data: existingAccount } = await supabase
        .from('telegram_accounts')
        .select('id')
        .eq('user_id', linkCode.user_id)
        .is('revoked_at', null)
        .maybeSingle();

      if (existingAccount) {
        await sendTelegramMessage(
          chatId,
          '❌ Your account is already linked to another Telegram account.\n\n' +
          '❌ حسابك مرتبط بالفعل بحساب تيليجرام آخر.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Check if chat_id is already linked to another user
      const { data: existingChatAccount } = await supabase
        .from('telegram_accounts')
        .select('id')
        .eq('chat_id', chatId)
        .is('revoked_at', null)
        .maybeSingle();

      if (existingChatAccount) {
        await sendTelegramMessage(
          chatId,
          '❌ This Telegram account is already linked to another user.\n\n' +
          '❌ حساب تيليجرام هذا مرتبط بالفعل بمستخدم آخر.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Link the account
      const { error: linkError } = await supabase
        .from('telegram_accounts')
        .insert({
          user_id: linkCode.user_id,
          chat_id: chatId,
          username: username || null,
        });

      if (linkError) {
        console.error('Error linking account:', linkError);
        await sendTelegramMessage(
          chatId,
          '❌ Failed to link account. Please try again.\n\n' +
          '❌ فشل ربط الحساب. يرجى المحاولة مرة أخرى.',
          supabaseUrl,
          supabaseServiceKey
        );
        return NextResponse.json({ ok: true });
      }

      // Mark code as used
      await supabase
        .from('telegram_link_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('code', code);

      // Enable Telegram notifications by default
      await supabase
        .from('notification_preferences')
        .update({ telegram_enabled: true })
        .eq('user_id', linkCode.user_id);

      await sendTelegramMessage(
        chatId,
        '✅ Successfully linked! You will now receive notifications here.\n\n' +
        'You can manage your notification preferences in the app settings.\n\n' +
        '✅ تم الربط بنجاح! ستتلقى الإشعارات هنا الآن.\n\n' +
        'يمكنك إدارة تفضيلات الإشعارات في إعدادات التطبيق.',
        supabaseUrl,
        supabaseServiceKey
      );

      return NextResponse.json({ ok: true });
    }

    // Handle other commands
    if (update.message?.text === '/help') {
      console.log('[Telegram Webhook] Processing /help command');
      const chatId = update.message.chat.id.toString();
      await sendTelegramMessage(
        chatId,
        '📋 <b>AnalyzingHub Bot Commands</b>\n\n' +
        '/start <code> - Link your account\n' +
        '/help - Show this help message\n' +
        '/status - Check connection status\n\n' +
        '📋 <b>أوامر بوت AnalyzingHub</b>\n\n' +
        '/start <الرمز> - ربط حسابك\n' +
        '/help - عرض هذه الرسالة\n' +
        '/status - التحقق من حالة الاتصال',
        supabaseUrl,
        supabaseServiceKey
      );
      return NextResponse.json({ ok: true });
    }

    if (update.message?.text === '/status') {
      console.log('[Telegram Webhook] Processing /status command');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const chatId = update.message.chat.id.toString();

      const { data: account } = await supabase
        .from('telegram_accounts')
        .select('linked_at')
        .eq('chat_id', chatId)
        .is('revoked_at', null)
        .maybeSingle();

      if (account) {
        await sendTelegramMessage(
          chatId,
          '✅ Your account is linked and active.\n\n' +
          `Linked since: ${new Date(account.linked_at).toLocaleString()}\n\n` +
          '✅ حسابك مرتبط ونشط.\n\n' +
          `مرتبط منذ: ${new Date(account.linked_at).toLocaleString()}`,
          supabaseUrl,
          supabaseServiceKey
        );
      } else {
        await sendTelegramMessage(
          chatId,
          '❌ No linked account found. Use /start <code> to link.\n\n' +
          '❌ لم يتم العثور على حساب مرتبط. استخدم /start <الرمز> للربط.',
          supabaseUrl,
          supabaseServiceKey
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in webhook:', error);
    return NextResponse.json({ ok: true }); // Always return ok to Telegram
  }
}

async function getBotToken(supabaseUrl: string, supabaseServiceKey: string): Promise<string | null> {
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

async function sendTelegramMessage(chatId: string, text: string, supabaseUrl: string, supabaseServiceKey: string) {
  console.log('[Telegram Webhook] Attempting to send message to chat:', chatId);

  const botToken = await getBotToken(supabaseUrl, supabaseServiceKey);
  if (!botToken) {
    console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not configured');
    return;
  }

  console.log('[Telegram Webhook] Bot token retrieved successfully');

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    };

    console.log('[Telegram Webhook] Sending to Telegram API:', url);
    console.log('[Telegram Webhook] Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[Telegram Webhook] Telegram API response:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error('[Telegram Webhook] Error sending message:', result);
    } else {
      console.log('[Telegram Webhook] Message sent successfully');
    }
  } catch (error) {
    console.error('[Telegram Webhook] Exception sending message:', error);
  }
}
