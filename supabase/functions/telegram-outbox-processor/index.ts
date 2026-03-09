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
  console.log('[telegram-outbox-processor] Starting, BASE_URL:', BASE_URL);

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

    const { data: messages, error: fetchError } = await supabase
      .from('telegram_outbox')
      .select('*')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'No pending messages', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[outbox] Found ${messages.length} pending messages`);

    const results = { processed: 0, sent: 0, failed: 0, retrying: 0 };

    for (const message of messages) {
      try {
        await supabase
          .from('telegram_outbox')
          .update({ status: 'processing' })
          .eq('id', message.id);

        let telegramResult: any;
        const msgType = message.message_type;

        if (['new_trade', 'new_high', 'winning_trade'].includes(msgType)) {
          telegramResult = await processTradeMessage(
            TELEGRAM_BOT_TOKEN,
            message.channel_id,
            message.payload,
            msgType
          );
        } else if (msgType === 'company_new_trade') {
          telegramResult = await processCompanyTradeMessage(
            TELEGRAM_BOT_TOKEN,
            message.channel_id,
            message.payload
          );
        } else {
          const formatted = formatMessage(message);
          if (formatted.photo) {
            telegramResult = await sendTelegramPhotoUrl(
              TELEGRAM_BOT_TOKEN,
              message.channel_id,
              formatted.photo,
              formatted.caption || ''
            );
          } else {
            telegramResult = await sendTelegramMessage(
              TELEGRAM_BOT_TOKEN,
              message.channel_id,
              formatted.text || ''
            );
          }
        }

        await supabase
          .from('telegram_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            telegram_message_id: telegramResult?.result?.message_id?.toString(),
          })
          .eq('id', message.id);

        results.sent++;
        console.log(`✅ Sent message ${message.id} (${msgType}) to ${message.channel_id}`);

      } catch (error: any) {
        console.error(`Error processing message ${message.id}:`, error.message);

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
        } else {
          const backoffSeconds = Math.pow(2, retryCount) * 60;
          await supabase
            .from('telegram_outbox')
            .update({
              status: 'pending',
              retry_count: retryCount,
              next_retry_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
              last_error: error.message || 'Unknown error',
            })
            .eq('id', message.id);
          results.retrying++;
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
    console.error('Fatal error:', error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ─── Trade message processor ─────────────────────────────────────────────────
// Generates the image by calling the generate-image API directly (no URL
// dependency on Supabase Storage). Uses Telegram multipart file upload so
// the image is always displayed inline regardless of Storage bucket settings.

async function processTradeMessage(
  botToken: string,
  chatId: string,
  payload: any,
  msgType: string
): Promise<any> {
  const trade    = payload?.trade ?? payload;
  const isNewHigh = msgType === 'new_high';
  const isWinning = msgType === 'winning_trade';
  const isTesting = payload?.isTestingMode ?? false;
  const highPrice: number | undefined =
    isNewHigh ? (payload?.highPrice ?? trade?.contract_high_since ?? undefined) : undefined;

  const caption = buildTradeCaption(trade, isNewHigh, isWinning, isTesting, highPrice);

  // Try to generate image bytes directly from the API
  if (trade?.id) {
    const imgBytes = await fetchImageBytes(trade.id, isNewHigh, highPrice);
    if (imgBytes && imgBytes.byteLength > 1024) {
      console.log(`[outbox] Sending photo (${imgBytes.byteLength} bytes) for trade ${trade.id}`);
      return await sendTelegramPhotoBytes(botToken, chatId, imgBytes, caption);
    }
    console.warn(`[outbox] Image generation failed for trade ${trade.id}, sending text fallback`);
  }

  // Text fallback — suppress link preview so website OG doesn't appear
  return await sendTelegramMessage(botToken, chatId, caption, true);
}

// ─── Image byte generation ───────────────────────────────────────────────────

async function fetchImageBytes(
  tradeId: string,
  isNewHigh: boolean,
  newHighPrice?: number
): Promise<ArrayBuffer | null> {
  try {
    const params = new URLSearchParams();
    if (isNewHigh) params.set('isNewHigh', 'true');
    if (newHighPrice != null) params.set('newHighPrice', String(newHighPrice));

    const url = `${BASE_URL}/api/indices/trades/${tradeId}/generate-image${params.size ? '?' + params : ''}`;
    console.log('[outbox] Fetching image from:', url);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(28_000),
      headers: { 'Accept': 'image/png' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[outbox] generate-image returned ${res.status}: ${body.substring(0, 200)}`);
      return null;
    }

    const buf = await res.arrayBuffer();
    console.log(`[outbox] Image bytes received: ${buf.byteLength}`);
    return buf;
  } catch (err: any) {
    console.warn('[outbox] fetchImageBytes error:', err.message);
    return null;
  }
}

// ─── Caption builder ──────────────────────────────────────────────────────────

function buildTradeCaption(
  trade: any,
  isNewHigh: boolean,
  isWinning: boolean,
  isTestingMode: boolean,
  highPrice?: number
): string {
  const entryPrice  = trade?.entry_contract_snapshot?.mid
    ?? trade?.entry_contract_snapshot?.price
    ?? trade?.entry_contract_snapshot?.last
    ?? 0;
  const currentPrice = trade?.current_contract ?? entryPrice;

  const analysisId = trade?.analysis?.id ?? trade?.analysis_id;
  const analysisUrl = analysisId ? `${BASE_URL}/dashboard/analysis/${analysisId}` : BASE_URL;

  // ── New High ──
  if (isNewHigh) {
    const dispHigh = highPrice ?? trade?.contract_high_since ?? currentPrice;
    const gainUsd  = ((dispHigh - entryPrice) * (trade?.qty ?? 1) * 100).toFixed(2);
    const expDate  = trade?.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
      : '';
    const optType  = trade?.option_type?.toUpperCase() ?? trade?.direction?.toUpperCase() ?? '';

    let msg = isTestingMode ? "🧪 <b>اختبار - قمة جديدة</b>\n\n" : "🚀 <b>قمة جديدة</b>\n\n";
    msg += `<b>المؤشر:</b> ${trade?.analysis?.index_symbol ?? trade?.underlying_index_symbol ?? ''}\n`;
    msg += `<b>العقد:</b> ${trade?.strike?.toFixed(0) ?? ''} - ${expDate} - ${optType}\n`;
    msg += `<b>سعر العقد:</b> $${dispHigh.toFixed(2)}\n`;
    msg += `<b>سعر الدخول:</b> $${entryPrice.toFixed(2)}\n`;
    msg += `<b>المكسب:</b> $${gainUsd}\n`;
    return msg;
  }

  // ── New Trade / Winning Trade ──
  let caption = '';
  if (isTestingMode) {
    caption = isWinning
      ? "🧪 <b>TEST - WINNING TRADE | اختبار - صفقة رابحة!</b>\n\n"
      : "🧪 <b>TEST TRADE | صفقة اختبارية</b>\n\n";
  } else {
    caption = isWinning
      ? "🎉 <b>WINNING TRADE | صفقة رابحة!</b>\n\n"
      : "🎯 <b>NEW TRADE | صفقة جديدة</b>\n\n";
  }

  caption += `<b>Index | المؤشر:</b> ${trade?.analysis?.index_symbol ?? trade?.underlying_index_symbol ?? ''}\n`;
  caption += `<b>Direction | الاتجاه:</b> ${(trade?.direction ?? '').toUpperCase()} | ${trade?.direction === 'call' ? 'شراء' : 'بيع'}\n`;

  if (trade?.strike) {
    caption += `<b>Strike | السعر:</b> $${Number(trade.strike).toFixed(0)}\n`;
  }

  caption += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  caption += `<b>Current | الحالي:</b> $${currentPrice.toFixed(2)}\n`;

  const snap = trade?.current_contract_snapshot ?? trade?.entry_contract_snapshot;
  const bid  = snap?.bid ?? 0;
  const ask  = snap?.ask ?? 0;
  if (bid > 0 && ask > 0) {
    caption += `<b>Bid/Ask | عرض/طلب:</b> $${bid.toFixed(2)} / $${ask.toFixed(2)}\n`;
  }

  if (isWinning) {
    const pnl       = (currentPrice - entryPrice) * (trade?.qty ?? 1) * 100;
    const pnlPct    = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2) : '0';
    caption += `<b>P/L | الربح/الخسارة:</b> $${pnl.toFixed(2)} (+${pnlPct}%)\n`;
    caption += `<b>🎊 Reached $100+ profit milestone! | تم الوصول لربح +$100!</b>\n`;
  }

  if (trade?.qty) {
    caption += `<b>Quantity | الكمية:</b> ${trade.qty} contracts | عقود\n`;
  }

  if (trade?.author?.full_name) {
    caption += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  }

  caption += `\n<a href="${analysisUrl}">📊 View Analysis | عرض التحليل</a>`;

  // Telegram photo caption limit is 1024 chars
  return caption.length > 1020 ? caption.substring(0, 1020) + '…' : caption;
}

// ─── formatMessage (non-trade message types) ─────────────────────────────────

function formatMessage(message: any): { text?: string; photo?: string; caption?: string } {
  const payload  = message.payload;
  switch (message.message_type) {
    case 'new_analysis':   return formatAnalysisMessage(payload);
    case 'trade_result':   return formatTradeResultMessage(payload);
    case 'trade_closed_for_new_entry': return formatTradeClosedForNewEntryMessage(payload);
    case 'trade_entry_averaged': return formatTradeEntryAveragedMessage(payload);
    case 'analysis_update':
    case 'trade_update':   return formatUpdateMessage(payload, message.message_type);
    default:               return { text: JSON.stringify(payload) };
  }
}

function formatAnalysisMessage(payload: any): { text: string } {
  const analysis    = payload.analysis || payload;
  const analysisUrl = `${BASE_URL}/dashboard/analysis/${analysis.id}`;

  let message = "📊 <b>NEW INDEX ANALYSIS | تحليل جديد للمؤشر</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${analysis.index_symbol}\n`;
  if (analysis.title)                message += `<b>Title | العنوان:</b> ${analysis.title}\n`;
  if (analysis.author?.full_name)    message += `<b>Analyst | المحلل:</b> ${analysis.author.full_name}\n`;
  message += `\n<a href="${analysisUrl}">📈 View Full Analysis | عرض التحليل الكامل</a>`;
  return { text: message };
}

function formatTradeResultMessage(payload: any): { text: string } {
  const trade     = payload.trade || payload;
  const outcome   = payload.outcome || trade.outcome;
  const pnl       = payload.pnl || trade.pnl_usd || 0;
  const analysisUrl = `${BASE_URL}/dashboard/analysis/${trade.analysis?.id || trade.analysis_id}`;
  const entryPrice  = trade.entry_contract_snapshot?.price || trade.entry_contract_snapshot?.mid || 0;
  const currentPrice = trade.current_contract || 0;
  const highestPrice = trade.contract_high_since || 0;

  const isWin = outcome === 'succeed';
  let message = isWin
    ? "🎉 <b>TRADE WIN | فوز في الصفقة!</b>\n\n"
    : outcome === 'expired'
    ? "⏰ <b>TRADE EXPIRED | انتهت الصفقة</b>\n\n"
    : "🛑 <b>TRADE STOPPED | إيقاف الصفقة</b>\n\n";

  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;
  message += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  message += `<b>Close | الإغلاق:</b> $${currentPrice.toFixed(2)}\n`;
  if (highestPrice > 0) message += `<b>Highest | الأعلى:</b> $${highestPrice.toFixed(2)}\n`;
  message += `<b>P/L | الربح/الخسارة:</b> $${pnl.toFixed(2)}${pnl > 0 ? ' ✅' : pnl < 0 ? ' ❌' : ''}\n`;
  if (trade.author?.full_name) message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  message += `\n<a href="${analysisUrl}">📊 View Analysis | عرض التحليل</a>`;
  return { text: message };
}

function formatTradeClosedForNewEntryMessage(payload: any): { text: string } {
  const trade       = payload.trade || payload;
  const reason      = payload.reason || 'Closed for new entry';
  const peakPrice   = payload.peakPrice || trade.contract_high_since || 0;
  const entryPrice  = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.price || 0;
  const pnlPercent  = entryPrice > 0 ? ((peakPrice - entryPrice) / entryPrice * 100).toFixed(2) : '0';

  let message = "🔄 <b>TRADE CLOSED FOR NEW ENTRY | إغلاق الصفقة لإدخال جديد</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;
  if (trade.strike) message += `<b>Strike | السعر:</b> $${Number(trade.strike).toFixed(0)}\n`;
  message += `<b>Entry | الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  message += `<b>Closed at Peak | الإغلاق عند القمة:</b> $${peakPrice.toFixed(2)}\n`;
  message += `<b>Peak Profit | أعلى ربح:</b> +${pnlPercent}%\n\n`;
  message += `<i>${reason}</i>\n`;
  if (trade.author?.full_name) message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  return { text: message };
}

function formatTradeEntryAveragedMessage(payload: any): { text: string } {
  const trade            = payload.trade || payload;
  const oldEntry         = payload.oldEntryPrice || 0;
  const newEntry         = payload.newEntryPrice || 0;
  const avgEntry         = payload.averagedEntryPrice || ((oldEntry + newEntry) / 2);
  const totalEntries     = payload.totalEntries || 2;

  let message = "📊 <b>ENTRY PRICE AVERAGED | متوسط سعر الدخول</b>\n\n";
  message += `<b>Index | المؤشر:</b> ${trade.analysis?.index_symbol || trade.underlying_index_symbol}\n`;
  message += `<b>Direction | الاتجاه:</b> ${trade.direction.toUpperCase()} | ${trade.direction === 'call' ? 'شراء' : 'بيع'}\n`;
  if (trade.strike) message += `<b>Strike | السعر:</b> $${Number(trade.strike).toFixed(0)}\n`;
  message += `\n<b>Original Entry | الدخول الأصلي:</b> $${oldEntry.toFixed(2)}\n`;
  message += `<b>New Entry | الدخول الجديد:</b> $${newEntry.toFixed(2)}\n`;
  message += `<b>Averaged Entry | متوسط الدخول:</b> $${avgEntry.toFixed(2)}\n`;
  message += `<b>Total Entries | إجمالي المداخل:</b> ${totalEntries}\n`;
  if (trade.author?.full_name) message += `<b>Analyst | المحلل:</b> ${trade.author.full_name}\n`;
  return { text: message };
}

function formatUpdateMessage(payload: any, _type: string): { text: string } {
  const update    = payload.update || payload;
  const entityUrl = payload.url || '#';

  let message = "📢 <b>UPDATE | تحديد</b>\n\n";
  if (update.body || update.text_en) message += `${update.body || update.text_en}\n\n`;
  if (update.text_ar)                message += `${update.text_ar}\n\n`;
  message += `<a href="${entityUrl}">View Details | عرض التفاصيل</a>`;
  return { text: message };
}

// ─── Company trade message processor ─────────────────────────────────────────
// Sends a formatted text message for company options contract trades.
// No image generation (company trades use text-only cards for now).

async function processCompanyTradeMessage(
  botToken: string,
  chatId: string,
  payload: any
): Promise<any> {
  const trade       = payload?.trade ?? payload;
  const isTesting   = payload?.isTestingMode ?? false;

  const caption = buildCompanyTradeCaption(trade, isTesting);
  console.log(`[outbox] Sending company_new_trade text to ${chatId} (isTesting=${isTesting})`);
  return await sendTelegramMessage(botToken, chatId, caption, true);
}

function buildCompanyTradeCaption(trade: any, isTestingMode: boolean): string {
  const direction    = (trade?.direction ?? '').toUpperCase();
  const symbol       = trade?.symbol ?? '';
  const strike       = trade?.strike ? `$${Number(trade.strike).toLocaleString()}` : '';
  const expiry       = trade?.expiry_date
    ? new Date(trade.expiry_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    : '';
  const entryPrice   = Number(trade?.entry_price ?? 0);
  const qty          = trade?.contracts_qty ?? 1;
  const isCall       = direction === 'CALL';

  const dirAr        = isCall ? 'شراء (CALL)' : 'بيع (PUT)';
  const prefix       = isTestingMode
    ? "🧪 <b>TEST COMPANY TRADE | صفقة شركة اختبارية</b>\n\n"
    : "🏢 <b>NEW COMPANY TRADE | صفقة شركة جديدة</b>\n\n";

  let msg = prefix;
  msg += `<b>Symbol | الرمز:</b> ${symbol}\n`;
  msg += `<b>Direction | الاتجاه:</b> ${direction} | ${dirAr}\n`;
  if (strike) msg += `<b>Strike | سعر التنفيذ:</b> ${strike}\n`;
  if (expiry) msg += `<b>Expiry | الانتهاء:</b> ${expiry}\n`;
  msg += `<b>Entry | سعر الدخول:</b> $${entryPrice.toFixed(2)}\n`;
  msg += `<b>Qty | الكمية:</b> ${qty} contract${qty !== 1 ? 's' : ''}\n`;

  const targets: any[] = Array.isArray(trade?.targets) ? trade.targets : [];
  if (targets.length > 0) {
    targets.forEach((t: any, i: number) => {
      const level = t?.level ?? t?.price ?? 0;
      if (level > 0) msg += `<b>Target ${i + 1} | هدف ${i + 1}:</b> $${Number(level).toFixed(2)}\n`;
    });
  }

  const stop = trade?.stoploss?.level ?? trade?.stoploss?.price ?? 0;
  if (stop > 0) msg += `<b>Stop | وقف الخسارة:</b> $${Number(stop).toFixed(2)}\n`;

  if (trade?.notes) msg += `\n<i>${trade.notes}</i>\n`;

  return msg.length > 4000 ? msg.substring(0, 4000) + '…' : msg;
}

// ─── Telegram send helpers ────────────────────────────────────────────────────

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  disableWebPreview = false
) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: disableWebPreview,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendMessage error: ${err}`);
  }
  return res.json();
}

// Multipart file upload — most reliable, no URL accessibility issues
async function sendTelegramPhotoBytes(
  botToken: string,
  chatId: string,
  pngBytes: ArrayBuffer,
  caption: string
) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'trade.png');
  form.append('caption', caption.substring(0, 1024));
  form.append('parse_mode', 'HTML');

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendPhoto (bytes) error: ${err}`);
  }
  return res.json();
}

// URL-based sendPhoto (kept for non-trade photo messages, falls back to sendDocument)
async function sendTelegramPhotoUrl(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption: string
) {
  console.log('[sendTelegramPhotoUrl] Attempting:', photoUrl);

  const photoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' }),
  });

  if (photoRes.ok) return photoRes.json();

  const photoErr = await photoRes.text();
  console.warn('[sendTelegramPhotoUrl] sendPhoto failed, falling back to sendDocument:', photoErr);

  const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, document: photoUrl, caption, parse_mode: 'HTML' }),
  });

  if (!docRes.ok) {
    const docErr = await docRes.text();
    throw new Error(`Telegram sendDocument fallback error: ${docErr}`);
  }
  return docRes.json();
}
