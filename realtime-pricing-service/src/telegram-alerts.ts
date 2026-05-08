/**
 * realtime-pricing-service/src/telegram-alerts.ts
 *
 * Telegram alert sender for the realtime pricing worker.
 *
 * Responsibilities:
 *   - Send buy-range "Price Hits" Telegram alerts from the pricing worker
 *   - Attempt to include a contract alert PNG image (sendPhoto)
 *   - Fall back to text-only sendMessage if image fails
 *   - Avoid duplicate alerts using an in-memory sent-set + DB flag
 *
 * This runs in the long-running Fly.io worker, NOT inside a Netlify Lambda.
 * Node 18 built-in fetch + FormData + Blob are used directly (no extra deps).
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuyRangeTrade {
  id:           string;
  symbol:       string;
  ticker:       string;
  optionType:   string;
  strike:       number | null;
  expiry:       string | null;
  entryPrice:   number;
  buyRangeMin:  number;
  buyRangeMax:  number;
  channelId:    string;
  analysisId:   string | null;
  analystName:  string | null;
}

export interface AlertResult {
  ok:          boolean;
  tradeId:     string;
  channelId:   string;
  imageSent:   boolean;
  messageId?:  string;
  error?:      string;
}

// ── Class ─────────────────────────────────────────────────────────────────────

export class TelegramAlertsService {
  private botToken:   string;
  private appBaseUrl: string;
  private supabase:   SupabaseClient;

  // In-memory dedup guard. Survives for the process lifetime.
  // DB flag (buy_range_alert_sent) provides cross-restart dedup.
  private sentTradeIds = new Set<string>();

  constructor(
    botToken: string,
    appBaseUrl: string,
    supabase: SupabaseClient
  ) {
    this.botToken   = botToken;
    this.appBaseUrl = appBaseUrl;
    this.supabase   = supabase;
  }

  // ── PUBLIC ─────────────────────────────────────────────────────────────────

  /**
   * Send a "Price Hits" alert for a trade that just entered its buy range.
   * Returns without throwing — any failure is logged and a fallback is attempted.
   */
  async sendBuyRangeAlert(trade: BuyRangeTrade, currentPrice: number): Promise<AlertResult> {
    if (this.sentTradeIds.has(trade.id)) {
      console.log(`[TelegramAlerts] ⏩ Already sent for trade ${trade.id} — skipping`);
      return { ok: true, tradeId: trade.id, channelId: trade.channelId, imageSent: false };
    }

    // Mark immediately (before await) to prevent concurrent duplicate sends
    this.sentTradeIds.add(trade.id);

    const caption = this.buildCaption(trade, currentPrice);
    let imageSent = false;
    let messageId: string | undefined;

    // ── Attempt image send ────────────────────────────────────────────────
    console.log(`[TelegramAlerts] ── BUY RANGE ALERT ──────────────────────────`);
    console.log(`[TelegramAlerts]   tradeId:     ${trade.id}`);
    console.log(`[TelegramAlerts]   symbol:      ${trade.symbol}`);
    console.log(`[TelegramAlerts]   ticker:      ${trade.ticker}`);
    console.log(`[TelegramAlerts]   channelId:   ${trade.channelId}`);
    console.log(`[TelegramAlerts]   currentPrice:${currentPrice}`);
    console.log(`[TelegramAlerts]   range:       [${trade.buyRangeMin}, ${trade.buyRangeMax}]`);

    if (this.appBaseUrl && !this.appBaseUrl.includes('localhost')) {
      try {
        const imgBuffer = await this.fetchImage(trade.id);
        if (imgBuffer && imgBuffer.byteLength > 1024) {
          console.log(`[TelegramAlerts]   📸 Image ${imgBuffer.byteLength} bytes — calling sendPhoto`);
          const res = await this.sendPhoto(trade.channelId, imgBuffer, caption);
          messageId = res.result?.message_id?.toString();
          imageSent = true;
          console.log(`[TelegramAlerts]   ✅ PHOTO SENT — message_id: ${messageId}`);
        } else {
          console.warn(`[TelegramAlerts]   ⚠️  Image too small or null — text fallback`);
        }
      } catch (imgErr: any) {
        console.error(`[TelegramAlerts]   ❌ Image/sendPhoto failed: ${imgErr.message}`);
      }
    } else {
      console.log(`[TelegramAlerts]   ⚠️  APP_BASE_URL is localhost — skipping image`);
    }

    // ── Text fallback ─────────────────────────────────────────────────────
    if (!imageSent) {
      try {
        const res = await this.sendMessage(trade.channelId, caption);
        messageId = res.result?.message_id?.toString();
        console.log(`[TelegramAlerts]   ✅ TEXT FALLBACK SENT — message_id: ${messageId}`);
      } catch (textErr: any) {
        console.error(`[TelegramAlerts]   ❌ Text fallback also failed: ${textErr.message}`);
        await this.writeDbError(trade.id, `sendMessage failed: ${textErr.message}`);
        return { ok: false, tradeId: trade.id, channelId: trade.channelId, imageSent: false, error: textErr.message };
      }
    }

    // ── Update DB ─────────────────────────────────────────────────────────
    await this.markAlertSent(trade.id, imageSent);

    return { ok: true, tradeId: trade.id, channelId: trade.channelId, imageSent, messageId };
  }

  // ── PRIVATE ────────────────────────────────────────────────────────────────

  private async fetchImage(tradeId: string): Promise<ArrayBuffer | null> {
    const url = `${this.appBaseUrl}/api/indices/trades/${tradeId}/generate-image`;
    console.log(`[TelegramAlerts]   🖼  Fetching image: ${url}`);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(28_000),
      headers: { Accept: 'image/png' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[TelegramAlerts]   ❌ Image HTTP ${res.status}: ${body.substring(0, 200)}`);
      return null;
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[TelegramAlerts]   ❌ Unexpected content-type "${ct}": ${body.substring(0, 200)}`);
      return null;
    }

    return res.arrayBuffer();
  }

  private async sendPhoto(
    chatId: string,
    pngBytes: ArrayBuffer,
    caption: string
  ): Promise<any> {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', new Blob([pngBytes], { type: 'image/png' }), 'alert.png');
    form.append('caption', caption.substring(0, 1024));
    form.append('parse_mode', 'HTML');

    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendPhoto`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`sendPhoto ${res.status}: ${err}`);
    }
    const body = await res.json();
    if (!body.ok) throw new Error(`sendPhoto rejected: ${JSON.stringify(body)}`);
    return body;
  }

  private async sendMessage(chatId: string, text: string): Promise<any> {
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`sendMessage ${res.status}: ${err}`);
    }
    const body = await res.json();
    if (!body.ok) throw new Error(`sendMessage rejected: ${JSON.stringify(body)}`);
    return body;
  }

  private async markAlertSent(tradeId: string, imageSent: boolean): Promise<void> {
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      buy_range_status:     'hit',
      buy_range_hit_at:     now,
      buy_range_alert_sent: true,
      buy_range_image_sent: imageSent,
      last_price_update_at: now,
    };
    if (imageSent) {
      updatePayload.telegram_image_sent_at = now;
      updatePayload.telegram_image_error   = null;
    } else {
      updatePayload.telegram_image_error = 'Image failed — text fallback sent';
    }

    const { error } = await this.supabase
      .from('index_trades')
      .update(updatePayload)
      .eq('id', tradeId);

    if (error) {
      console.error(`[TelegramAlerts] Failed to mark alert sent for trade ${tradeId}:`, error.message);
    } else {
      console.log(`[TelegramAlerts] ✅ DB updated — trade ${tradeId} buy_range_status=hit imageSent=${imageSent}`);
    }
  }

  private async writeDbError(tradeId: string, errorMsg: string): Promise<void> {
    try {
      await this.supabase
        .from('index_trades')
        .update({ telegram_image_error: errorMsg.substring(0, 500) })
        .eq('id', tradeId);
    } catch { /* best-effort */ }
  }

  private buildCaption(trade: BuyRangeTrade, currentPrice: number): string {
    const baseUrl = this.appBaseUrl.includes('localhost') ? 'https://analyzhub.com' : this.appBaseUrl;
    const analysisLink = trade.analysisId
      ? `${baseUrl}/dashboard/analysis/${trade.analysisId}`
      : null;

    const now = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

    let msg = `🎯 <b>Price Hits Buy Range</b>\n\n`;
    msg += `<b>${trade.symbol} Contract Alert</b>\n`;
    if (trade.ticker)     msg += `<b>Contract:</b> ${trade.ticker.replace(/^O:/, '')}\n`;
    msg += `<b>Type:</b> ${trade.optionType}\n`;
    if (trade.strike)     msg += `<b>Strike:</b> $${trade.strike.toLocaleString()}\n`;
    if (trade.expiry)     msg += `<b>Expiration:</b> ${trade.expiry}\n`;
    msg += `<b>Current Price:</b> $${currentPrice.toFixed(2)}\n`;
    msg += `<b>Buy Range:</b> $${trade.buyRangeMin.toFixed(2)} – $${trade.buyRangeMax.toFixed(2)}\n`;
    if (trade.entryPrice) msg += `<b>Entry Price:</b> $${trade.entryPrice.toFixed(2)}\n`;
    if (trade.analystName) msg += `<b>Analyst:</b> ${trade.analystName}\n`;
    if (analysisLink)      msg += `<b>Analysis:</b> <a href="${analysisLink}">View</a>\n`;
    msg += `<b>Time:</b> ${now} ET\n`;
    msg += `\n<i>Sent by AnalyzingHub realtime pricing worker</i>`;

    return msg.length > 1020 ? msg.substring(0, 1020) + '…' : msg;
  }
}
