import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BASE_URL = Deno.env.get('APP_BASE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://analyzhub.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[telegram-outbox-processor] Starting');

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: botTokenSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();

    const TELEGRAM_BOT_TOKEN = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("Telegram bot token not configured");
    }

    console.log('[telegram-outbox-processor] Bot token loaded from:', botTokenSetting?.setting_value ? 'database' : 'environment');

    const { data: messages, error: fetchError } = await supabase
      .from('telegram_outbox')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error('Error fetching messages:', fetchError);
      throw fetchError;
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No pending messages', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${messages.length} pending messages`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      retrying: 0,
    };

    for (const message of messages) {
      try {
        await supabase
          .from('telegram_outbox')
          .update({ status: 'processing' })
          .eq('id', message.id);

        const formattedMessage = formatMessage(message);

        let telegramResult;
        if (formattedMessage.photo) {
          telegramResult = await sendTelegramPhoto(
            TELEGRAM_BOT_TOKEN,
            message.channel_id,
            formattedMessage.photo,
            formattedMessage.caption || ''
          );
        } else {
          telegramResult = await sendTelegramMessage(
            TELEGRAM_BOT_TOKEN,
            message.channel_id,
            formattedMessage.text || ''
          );
        }

        await supabase
          .from('telegram_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            telegram_message_id: telegramResult.result?.message_id?.toString(),
          })
          .eq('id', message.id);

        results.sent++;
        console.log(`✅ Sent message ${message.id} to ${message.channel_id}`);

      } catch (error: any) {
        console.error(`Error processing message ${message.id}:`, error);

        const retryCount = message.retry_count + 1;
        const maxRetries = message.max_retries || 3;

        if (retryCount >= maxRetries) {
          await supabase
            .from('telegram_outbox')
            .update({
              status: 'failed',
              failed_at: new Date().toISOString(),
              last_error: error.message || 'Unknown error',
              retry_count: retryCount,
            })
            .eq('id', message.id);

          results.failed++;
          console.log(`❌ Message ${message.id} failed after ${retryCount} attempts`);
        } else {
          const backoffSeconds = Math.pow(2, retryCount) * 60;
          const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

          await supabase
            .from('telegram_outbox')
            .update({
              status: 'pending',
              retry_count: retryCount,
              next_retry_at: nextRetry.toISOString(),
              last_error: error.message || 'Unknown error',
            })
            .eq('id', message.id);

          results.retrying++;
          console.log(`🔄 Message ${message.id} scheduled for retry ${retryCount}/${maxRetries} in ${backoffSeconds}s`);
        }
      }

      results.processed++;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms:`, results);

    return new Response(
      JSON.stringify({ ok: true, duration, ...results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatMessage(message: any): { text?: string; photo?: string; caption?: string } {
  const payload = message.payload;
  const messageType = message.message_type;

  switch (messageType) {
    case 'new_analysis':
      return formatAnalysisMessage(payload);
    case 'new_trade':
    case 'new_high':
    case 'winning_trade':
      return formatTradeMessage(payload, messageType === 'new_high' || messageType === 'winning_trade', messageType === 'winning_trade');
    case 'trade_result':
      return formatTradeResultMessage(payload);
    case 'trade_closed_for_new_entry':
      return formatTradeClosedForNewEntryMessage(payload);
    case 'trade_entry_averaged':
      return formatTradeEntryAveragedMessage(payload);
    case 'analysis_update':
    case 'trade_update':
      return formatUpdateMessage(payload, messageType);
    default:
      return { text: JSON.stringify(payload) };
  }
}

function formatAnalysisMessage(payload: any): { text: string } {
  const analysis = payload.analysis || payload;
  const analysisUrl = `${BASE_URL}/dashboard/analysis/${analysis.id}`;

  let message = "📊 <b>NEW INDEX ANALYSIS | تحليل جديد للمؤشر</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${analysis.index_symbol}\n`;
  if (analysis.title) {
    message += `<b>Title | العنوان:</b> ${analysis.title}\n`;
  }
  if (analysis.author?.full_name) {
    message += `<b>Analyst | المحلل:</b> ${analysis.author.full_name}\n`;
  }
  message += `\n<a href="${analysisUrl}">📈 View Full Analysis | عرض التحليل الكامل</a>`;

  return { text: message };
}

function formatTradeMessage(payload: any, isNewHigh: boolean, isWinning: boolean = false): { text?: string; photo?: string; caption?: string } {
  const trade = payload.trade || payload;

  console.log('[OutboxProcessor] formatTradeMessage called:', {
    tradeId: trade.id,
    hasContractUrl: !!trade.contract_url,
    contractUrl: trade.contract_url,
    isNewHigh,
    isWinning,
  });

  const analysisUrl = `${BASE_URL}/dashboard/analysis/${trade.analysis?.id || trade.analysis_id}`;
  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const currentPrice = trade.current_contract || entryPrice;

  const currentSnapshot = trade.current_contract_snapshot || trade.entry_contract_snapshot;
  const bid = currentSnapshot?.bid || 0;
  const ask = currentSnapshot?.ask || 0;

  // Simplified format for new highs (Arabic only)
  if (isNewHigh) {
    const highPrice = payload.highPrice || trade.contract_high_since || currentPrice;
    const gainDollars = ((highPrice - entryPrice) * (trade.qty || 1) * 100).toFixed(2);

    // Format expiry date
    const expiryDate = trade.expiry ? new Date(trade.expiry).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '';
    const optionType = trade.option_type?.toUpperCase() || trade.direction?.toUpperCase() || '';

    let caption = "🚀 <b>قمة جديدة</b>\n\n";
    caption += `<b>المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
    caption += `<b>العقد:</b> ${trade.strike?.toFixed(0)} - ${expiryDate} - ${optionType}\n`;
    caption += `<b>المكسب:</b> $${gainDollars}\n`;

    if (trade.contract_url) {
      return { photo: trade.contract_url, caption };
    }

    return { text: caption };
  }

  // Full format for new trades and winning trades
  let caption = isWinning
    ? "🎉 <b>WINNING TRADE | صفقة رابحة!</b>\n\n"
    : "🎯 <b>NEW TRADE | صفقة جديدة</b>\n\n";

  caption += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  caption += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;

  if (trade.strike) {
    caption += `<b>Strike | السعر:</b> $${trade.strike.toFixed(0)}\n`;
  }

  caption += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  caption += `<b>Current | الحالي:</b> $${currentPrice.toFixed(2)}\n`;

  if (bid > 0 && ask > 0) {
    caption += `<b>Bid/Ask | عرض/طلب:</b> $${bid.toFixed(2)} / $${ask.toFixed(2)}\n`;
  }

  if (isWinning) {
    const pnl = payload.pnl || 0;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);

    caption += `<b>P/L | الربح/الخسارة:</b> $${pnl.toFixed(2)} (+${pnlPercent}%)\n`;
    caption += `<b>🎊 Reached $100+ profit milestone! | تم الوصول لربح +$100!</b>\n`;
  }

  if (trade.qty) {
    caption += `<b>Quantity | الكمية:</b> ${trade.qty} contracts | عقود\n`;
  }

  if (trade.author?.full_name) {
    caption += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  }

  caption += `\n<a href="${analysisUrl}">📊 View Analysis | عرض التحليل</a>`;

  if (trade.contract_url) {
    return { photo: trade.contract_url, caption };
  }

  return { text: caption };
}

function formatTradeResultMessage(payload: any): { text: string } {
  const trade = payload.trade || payload;
  const outcome = payload.outcome || trade.outcome;
  const pnl = payload.pnl || trade.pnl_usd || 0;
  const analysisUrl = `${BASE_URL}/dashboard/analysis/${trade.analysis?.id || trade.analysis_id}`;

  const isWin = outcome === 'succeed';
  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const currentPrice = trade.current_contract || 0;
  const highestPrice = trade.contract_high_since || 0;

  let message = isWin
    ? "🎉 <b>TRADE WIN | فوز في الصفقة!</b>\n\n"
    : outcome === 'expired'
    ? "⏰ <b>TRADE EXPIRED | انتهت الصفقة</b>\n\n"
    : "🛑 <b>TRADE STOPPED | إيقاف الصفقة</b>\n\n";

  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;
  message += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  message += `<b>Close | الإغلاق:</b> $${currentPrice.toFixed(2)}\n`;

  if (highestPrice > 0) {
    message += `<b>Highest | الأعلى:</b> $${highestPrice.toFixed(2)}\n`;
  }

  message += `<b>P/L | الربح/الخسارة:</b> $${pnl.toFixed(2)}`;
  if (pnl > 0) {
    message += " ✅";
  } else if (pnl < 0) {
    message += " ❌";
  }
  message += "\n";

  if (trade.author?.full_name) {
    message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  }

  message += `\n<a href="${analysisUrl}">📊 View Analysis | عرض التحليل</a>`;

  return { text: message };
}

function formatUpdateMessage(payload: any, type: string): { text: string } {
  const update = payload.update || payload;
  const entityUrl = payload.url || '#';

  let message = "📢 <b>UPDATE | تحديث</b>\n\n";

  if (update.body || update.text_en) {
    message += `${update.body || update.text_en}\n\n`;
  }

  if (update.text_ar) {
    message += `${update.text_ar}\n\n`;
  }

  message += `<a href="${entityUrl}">View Details | عرض التفاصيل</a>`;

  return { text: message };
}

function formatTradeClosedForNewEntryMessage(payload: any): { text: string } {
  const trade = payload.trade || payload;
  const reason = payload.reason || 'Closed for new entry';
  const peakPrice = payload.peakPrice || trade.peak_price_after_entry || trade.contract_high_since || 0;

  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const pnlPercent = ((peakPrice - entryPrice) / entryPrice * 100).toFixed(2);

  let message = "🔄 <b>TRADE CLOSED FOR NEW ENTRY | إغلاق الصفقة لإدخال جديد</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;

  if (trade.strike) {
    message += `<b>Strike | السعر:</b> $${trade.strike.toFixed(0)}\n`;
  }

  message += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  message += `<b>Closed at Peak | الإغلاق عند القمة:</b> $${peakPrice.toFixed(2)}\n`;
  message += `<b>Peak Profit | أعلى ربح:</b> +${pnlPercent}%\n\n`;
  message += `<i>${reason}</i>\n`;

  if (trade.author?.full_name) {
    message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  }

  return { text: message };
}

function formatTradeEntryAveragedMessage(payload: any): { text: string } {
  const trade = payload.trade || payload;
  const oldEntryPrice = payload.oldEntryPrice || 0;
  const newEntryPrice = payload.newEntryPrice || 0;
  const averagedEntryPrice = payload.averagedEntryPrice || ((oldEntryPrice + newEntryPrice) / 2);
  const totalEntries = payload.totalEntries || 2;

  let message = "📊 <b>ENTRY PRICE AVERAGED | متوسط سعر الدخول</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;

  if (trade.strike) {
    message += `<b>Strike | السعر:</b> $${trade.strike.toFixed(0)}\n`;
  }

  message += `\n<b>Original Entry | الدخول الأصلي:</b> $${oldEntryPrice.toFixed(2)}\n`;
  message += `<b>New Entry | الدخول الجديد:</b> $${newEntryPrice.toFixed(2)}\n`;
  message += `<b>Averaged Entry | متوسط الدخول:</b> $${averagedEntryPrice.toFixed(2)}\n`;
  message += `<b>Total Entries | إجمالي المداخل:</b> ${totalEntries}\n\n`;
  message += `<i>Entry price has been averaged. Trade continues with new calculation. | تم حساب متوسط سعر الدخول. تستمر الصفقة بحساب جديد.</i>\n`;

  if (trade.author?.full_name) {
    message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  }

  return { text: message };
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }

  return response.json();
}

async function sendTelegramPhoto(botToken: string, chatId: string, photoUrl: string, caption: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }

  return response.json();
}