import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  validateAndNormalizeSymbol,
  isTickerQuery
} from '@/lib/telegram/symbol-utils';
import {
  buildAnalysisResultMessage,
  buildNoResultsMessage,
  buildRateLimitMessage,
  buildTickerHelpMessage,
  buildTemporaryErrorMessage
} from '@/lib/telegram/message-builder';

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

    // Handle callback queries (pagination)
    if (update.callback_query) {
      console.log('[Telegram Webhook] Processing callback query');
      await handleCallbackQuery(update.callback_query, supabaseUrl, supabaseServiceKey);
      return NextResponse.json({ ok: true });
    }

    // Handle /start command with code
    if (update.message?.text?.startsWith('/start')) {
      console.log('[Telegram Webhook] Processing /start command');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const chatId = update.message.chat.id.toString();
      const username = update.message.from.username;
      const text = update.message.text;
      const parts = text.split(' ');

      console.log('[Telegram Webhook] Chat ID:', chatId, 'Username:', username, 'Parts:', parts);

      // Check for username-based auto-linking first (if no code provided and user has username)
      if (parts.length < 2 && username) {
        console.log('[Telegram Webhook] Checking for username-based link:', username);
        const { data: usernameLink } = await supabase
          .from('telegram_username_links')
          .select('user_id, status, expires_at')
          .eq('telegram_username', username.toLowerCase())
          .eq('status', 'pending')
          .maybeSingle();

        if (usernameLink && new Date(usernameLink.expires_at) > new Date()) {
          console.log('[Telegram Webhook] Found pending username link, auto-linking...');

          // Check if user already has a linked account
          const { data: existingAccount } = await supabase
            .from('telegram_accounts')
            .select('id')
            .eq('user_id', usernameLink.user_id)
            .is('revoked_at', null)
            .maybeSingle();

          if (!existingAccount) {
            // Check if chat_id is already linked to another user
            const { data: existingChatAccount } = await supabase
              .from('telegram_accounts')
              .select('id')
              .eq('chat_id', chatId)
              .is('revoked_at', null)
              .maybeSingle();

            if (!existingChatAccount) {
              // Link the account
              const { error: linkError } = await supabase
                .from('telegram_accounts')
                .insert({
                  user_id: usernameLink.user_id,
                  chat_id: chatId,
                  username: username,
                });

              if (!linkError) {
                // Mark username link as verified
                await supabase
                  .from('telegram_username_links')
                  .update({
                    status: 'verified',
                    verified_at: new Date().toISOString()
                  })
                  .eq('telegram_username', username.toLowerCase())
                  .eq('user_id', usernameLink.user_id);

                // Enable Telegram notifications
                await supabase
                  .from('notification_preferences')
                  .update({ telegram_enabled: true })
                  .eq('user_id', usernameLink.user_id);

                await sendTelegramMessage(
                  chatId,
                  '✅ <b>Account Linked Successfully!</b>\n\n' +
                  'Your Telegram account has been automatically linked to your AnalyzingHub account.\n\n' +
                  'You will now receive notifications here.\n\n' +
                  '━━━━━━━━━━━━━━━━━━━\n\n' +
                  '✅ <b>تم ربط الحساب بنجاح!</b>\n\n' +
                  'تم ربط حساب تيليجرام الخاص بك تلقائياً بحساب AnalyzingHub.\n\n' +
                  'ستتلقى الإشعارات هنا الآن.',
                  supabaseUrl,
                  supabaseServiceKey
                );

                return NextResponse.json({ ok: true });
              }
            }
          }
        }
      }

      if (parts.length < 2) {
        console.log('[Telegram Webhook] No code provided, sending welcome message');
        await sendTelegramMessage(
          chatId,
          '🎯 <b>Welcome to AnalyzingHub Bot!</b>\n\n' +
          '📊 <b>What I Can Do:</b>\n' +
          '• Search stock analyses - just send any ticker (e.g., AAPL, TSLA)\n' +
          '• Link your account for notifications\n' +
          '• Get real-time updates on analyses\n\n' +
          '🔗 <b>Link Your Account:</b>\n' +
          '1. Log in to AnalyzingHub\n' +
          '2. Go to Settings → Telegram\n' +
          '3. Generate a link code\n' +
          '4. Send /start [code] to me\n\n' +
          '💡 <b>Quick Start:</b>\n' +
          '• Type /help to see all commands\n' +
          '• Try sending "AAPL" to search analyses\n' +
          '• Use /status to check if you\'re linked\n\n' +
          '━━━━━━━━━━━━━━━━━━━\n\n' +
          '🎯 <b>مرحباً بك في بوت AnalyzingHub!</b>\n\n' +
          '📊 <b>ما يمكنني فعله:</b>\n' +
          '• البحث عن تحليلات الأسهم - فقط أرسل أي رمز (مثل: AAPL، TSLA)\n' +
          '• ربط حسابك لتلقي الإشعارات\n' +
          '• الحصول على تحديثات فورية للتحليلات\n\n' +
          '🔗 <b>لربط حسابك:</b>\n' +
          '1. سجل الدخول إلى AnalyzingHub\n' +
          '2. اذهب إلى الإعدادات ← تيليجرام\n' +
          '3. أنشئ رمز الربط\n' +
          '4. أرسل /start [الرمز] إلي\n\n' +
          '💡 <b>البدء السريع:</b>\n' +
          '• اكتب /help لرؤية جميع الأوامر\n' +
          '• جرب إرسال "AAPL" للبحث عن التحليلات\n' +
          '• استخدم /status للتحقق من الربط',
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
        '📋 <b>AnalyzingHub Bot - Help Menu</b>\n\n' +
        '🔹 <b>Commands:</b>\n' +
        '/start [code] - Link your account to receive notifications\n' +
        '/help - Show this help menu\n' +
        '/status - Check if your account is linked\n' +
        '/menu - Show this menu again\n\n' +
        '🔹 <b>Stock Symbol Search:</b>\n' +
        'Just send any ticker symbol (without commands):\n' +
        '• <code>AAPL</code> - Search Apple analyses\n' +
        '• <code>TSLA</code> - Search Tesla analyses\n' +
        '• <code>2222.SR</code> - Saudi market stocks\n' +
        '• Works with any symbol up to 20 chars\n\n' +
        '🔹 <b>Features:</b>\n' +
        '✓ Instant search results with clickable links\n' +
        '✓ Pagination for large result sets\n' +
        '✓ Real-time notifications (when linked)\n' +
        '✓ Direct links to full analyses\n\n' +
        '🔹 <b>Rate Limits:</b>\n' +
        'Up to 10 symbol searches every 10 minutes\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 <b>بوت AnalyzingHub - قائمة المساعدة</b>\n\n' +
        '🔹 <b>الأوامر:</b>\n' +
        '/start [الرمز] - ربط حسابك لتلقي الإشعارات\n' +
        '/help - عرض قائمة المساعدة هذه\n' +
        '/status - التحقق من ربط حسابك\n' +
        '/menu - عرض هذه القائمة مرة أخرى\n\n' +
        '🔹 <b>البحث عن رمز السهم:</b>\n' +
        'فقط أرسل أي رمز سهم (بدون أوامر):\n' +
        '• <code>AAPL</code> - البحث عن تحليلات أبل\n' +
        '• <code>TSLA</code> - البحث عن تحليلات تسلا\n' +
        '• <code>2222.SR</code> - أسهم السوق السعودي\n' +
        '• يعمل مع أي رمز حتى 20 حرف\n\n' +
        '🔹 <b>المميزات:</b>\n' +
        '✓ نتائج بحث فورية مع روابط قابلة للنقر\n' +
        '✓ ترقيم الصفحات للنتائج الكبيرة\n' +
        '✓ إشعارات فورية (عند الربط)\n' +
        '✓ روابط مباشرة للتحليلات الكاملة\n\n' +
        '🔹 <b>حدود الاستخدام:</b>\n' +
        'حتى 10 عمليات بحث كل 10 دقائق',
        supabaseUrl,
        supabaseServiceKey
      );
      return NextResponse.json({ ok: true });
    }

    if (update.message?.text === '/menu') {
      console.log('[Telegram Webhook] Processing /menu command');
      const chatId = update.message.chat.id.toString();
      await sendTelegramMessage(
        chatId,
        '📋 <b>AnalyzingHub Bot - Help Menu</b>\n\n' +
        '🔹 <b>Commands:</b>\n' +
        '/start [code] - Link your account to receive notifications\n' +
        '/help - Show this help menu\n' +
        '/status - Check if your account is linked\n' +
        '/menu - Show this menu again\n\n' +
        '🔹 <b>Stock Symbol Search:</b>\n' +
        'Just send any ticker symbol (without commands):\n' +
        '• <code>AAPL</code> - Search Apple analyses\n' +
        '• <code>TSLA</code> - Search Tesla analyses\n' +
        '• <code>2222.SR</code> - Saudi market stocks\n' +
        '• Works with any symbol up to 20 chars\n\n' +
        '🔹 <b>Features:</b>\n' +
        '✓ Instant search results with clickable links\n' +
        '✓ Pagination for large result sets\n' +
        '✓ Real-time notifications (when linked)\n' +
        '✓ Direct links to full analyses\n\n' +
        '🔹 <b>Rate Limits:</b>\n' +
        'Up to 10 symbol searches every 10 minutes\n\n' +
        '━━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 <b>بوت AnalyzingHub - قائمة المساعدة</b>\n\n' +
        '🔹 <b>الأوامر:</b>\n' +
        '/start [الرمز] - ربط حسابك لتلقي الإشعارات\n' +
        '/help - عرض قائمة المساعدة هذه\n' +
        '/status - التحقق من ربط حسابك\n' +
        '/menu - عرض هذه القائمة مرة أخرى\n\n' +
        '🔹 <b>البحث عن رمز السهم:</b>\n' +
        'فقط أرسل أي رمز سهم (بدون أوامر):\n' +
        '• <code>AAPL</code> - البحث عن تحليلات أبل\n' +
        '• <code>TSLA</code> - البحث عن تحليلات تسلا\n' +
        '• <code>2222.SR</code> - أسهم السوق السعودي\n' +
        '• يعمل مع أي رمز حتى 20 حرف\n\n' +
        '🔹 <b>المميزات:</b>\n' +
        '✓ نتائج بحث فورية مع روابط قابلة للنقر\n' +
        '✓ ترقيم الصفحات للنتائج الكبيرة\n' +
        '✓ إشعارات فورية (عند الربط)\n' +
        '✓ روابط مباشرة للتحليلات الكاملة\n\n' +
        '🔹 <b>حدود الاستخدام:</b>\n' +
        'حتى 10 عمليات بحث كل 10 دقائق',
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

    // Handle ticker symbol queries
    if (update.message?.text && !update.message.text.startsWith('/')) {
      const messageText = update.message.text;

      if (isTickerQuery(messageText)) {
        console.log('[Telegram Webhook] Processing ticker query:', messageText);
        const chatId = update.message.chat.id.toString();
        await handleTickerQuery(messageText, chatId, supabaseUrl, supabaseServiceKey);
        return NextResponse.json({ ok: true });
      }

      // Not a command and not a ticker - show help
      const chatId = update.message.chat.id.toString();
      await sendTelegramMessage(
        chatId,
        buildTickerHelpMessage(),
        supabaseUrl,
        supabaseServiceKey
      );
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

async function handleTickerQuery(
  messageText: string,
  chatId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  // Validate and normalize symbol
  const validation = validateAndNormalizeSymbol(messageText);

  if (!validation.valid) {
    await sendTelegramMessage(
      chatId,
      `❌ Invalid symbol: ${validation.error}`,
      supabaseUrl,
      supabaseServiceKey
    );
    return;
  }

  const symbol = validation.normalized!;

  // Query analyses using internal API
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://analyzinghub.com';
    const apiUrl = `${baseUrl}/api/telegram/query-symbol`;

    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': webhookSecret || '',
      },
      body: JSON.stringify({
        symbol,
        page: 1,
        pageSize: 10,
        chatId
      })
    });

    if (!response.ok) {
      throw new Error('Query API failed');
    }

    const result = await response.json();

    // Check rate limit
    if (result.rateLimited) {
      await sendTelegramMessage(
        chatId,
        buildRateLimitMessage(),
        supabaseUrl,
        supabaseServiceKey
      );
      return;
    }

    // Check if results found
    if (!result.analyses || result.analyses.length === 0) {
      const message = buildNoResultsMessage(
        symbol,
        baseUrl
      );
      await sendTelegramMessageWithKeyboard(
        chatId,
        message.text,
        message.keyboard,
        supabaseUrl,
        supabaseServiceKey
      );
      return;
    }

    // Build and send results
    const message = buildAnalysisResultMessage(
      symbol,
      result.analyses,
      result.pagination,
      baseUrl
    );

    await sendTelegramMessageWithKeyboard(
      chatId,
      message.text,
      message.keyboard,
      supabaseUrl,
      supabaseServiceKey
    );

  } catch (error) {
    console.error('[Telegram Webhook] Error querying symbol:', error);
    await sendTelegramMessage(
      chatId,
      buildTemporaryErrorMessage(),
      supabaseUrl,
      supabaseServiceKey
    );
  }
}

async function handleCallbackQuery(
  callbackQuery: any,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const chatId = callbackQuery.message.chat.id.toString();
  const callbackData = callbackQuery.data;

  // Parse callback data: ANALYSES:SYMBOL:PAGE
  const parts = callbackData.split(':');
  if (parts.length !== 3 || parts[0] !== 'ANALYSES') {
    console.error('[Telegram Webhook] Invalid callback data:', callbackData);
    return;
  }

  const symbol = parts[1];
  const page = parseInt(parts[2]);

  if (isNaN(page) || page < 1) {
    console.error('[Telegram Webhook] Invalid page number:', parts[2]);
    return;
  }

  // Answer callback query first
  const botToken = await getBotToken(supabaseUrl, supabaseServiceKey);
  if (botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQuery.id
      })
    });
  }

  // Query the requested page
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://analyzinghub.com';
    const apiUrl = `${baseUrl}/api/telegram/query-symbol`;
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': webhookSecret || '',
      },
      body: JSON.stringify({
        symbol,
        page,
        pageSize: 10,
        chatId
      })
    });

    if (!response.ok) {
      throw new Error('Query API failed');
    }

    const result = await response.json();

    if (!result.analyses || result.analyses.length === 0) {
      return;
    }

    // Build and edit message
    const message = buildAnalysisResultMessage(
      symbol,
      result.analyses,
      result.pagination,
      baseUrl
    );

    await editTelegramMessage(
      chatId,
      callbackQuery.message.message_id,
      message.text,
      message.keyboard,
      supabaseUrl,
      supabaseServiceKey
    );

  } catch (error) {
    console.error('[Telegram Webhook] Error handling pagination:', error);
  }
}

async function sendTelegramMessageWithKeyboard(
  chatId: string,
  text: string,
  keyboard: any[],
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const botToken = await getBotToken(supabaseUrl, supabaseServiceKey);
  if (!botToken) {
    console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not configured');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: keyboard
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Telegram Webhook] Error sending message:', result);
    } else {
      console.log('[Telegram Webhook] Message sent successfully');
    }
  } catch (error) {
    console.error('[Telegram Webhook] Exception sending message:', error);
  }
}

async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  keyboard: any[],
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  const botToken = await getBotToken(supabaseUrl, supabaseServiceKey);
  if (!botToken) {
    console.error('[Telegram Webhook] TELEGRAM_BOT_TOKEN not configured');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: keyboard
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[Telegram Webhook] Error editing message:', result);
    } else {
      console.log('[Telegram Webhook] Message edited successfully');
    }
  } catch (error) {
    console.error('[Telegram Webhook] Exception editing message:', error);
  }
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
