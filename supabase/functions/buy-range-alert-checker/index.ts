/**
 * buy-range-alert-checker
 *
 * Scheduled edge function that checks active index_trades with pending buy range
 * alerts. When the current contract price enters the analyst-defined buy range,
 * it sends a "Price Hits" Telegram alert (image + caption) once and marks the
 * alert as hit.
 *
 * Deduplication: buy_range_alert_sent prevents duplicate text alerts.
 *                buy_range_image_sent prevents duplicate image sends.
 * Expiry:        expired alerts are marked and skipped.
 * Fallback:      if image generation or sendPhoto fails, text message is sent.
 *
 * Invocation: POST (from cron) or via the Supabase schedule:
 *   supabase functions invoke buy-range-alert-checker --no-verify-jwt
 *
 * Required Supabase secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   TELEGRAM_BOT_TOKEN (or stored in admin_settings)
 *   APP_BASE_URL  — your production Next.js URL (e.g. https://analyzhub.com)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE_URL = Deno.env.get("APP_BASE_URL") || Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://analyzhub.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  console.log(`[buy-range-checker] ══════════════════════════════════════════`);
  console.log(`[buy-range-checker] BUY RANGE ALERT CHECK STARTED at ${startedAt}`);
  console.log(`[buy-range-checker] BASE_URL: ${BASE_URL}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Load bot token ─────────────────────────────────────────────────────
    const { data: botTokenSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();

    const botToken = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      console.error("[buy-range-checker] ❌ TELEGRAM_BOT_TOKEN not configured — aborting");
      return new Response(
        JSON.stringify({ ok: false, error: "Telegram bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Expire overdue alerts ──────────────────────────────────────────────
    const { count: expiredCount } = await supabase
      .from("index_trades")
      .update({ buy_range_status: "expired" })
      .eq("buy_range_status", "pending")
      .lt("buy_range_expires_at", new Date().toISOString())
      .not("buy_range_expires_at", "is", null)
      .select("id", { count: "exact", head: true });

    if (expiredCount && expiredCount > 0) {
      console.log(`[buy-range-checker] ⏰ Expired ${expiredCount} overdue buy range alert(s)`);
    }

    // ── Fetch pending alerts ───────────────────────────────────────────────
    const { data: trades, error: fetchErr } = await supabase
      .from("index_trades")
      .select(`
        id, underlying_index_symbol, polygon_option_ticker,
        strike, expiry, option_type, direction,
        current_contract, entry_price,
        entry_contract_snapshot,
        buy_range_min, buy_range_max,
        buy_range_status, buy_range_alert_sent, buy_range_image_sent,
        buy_range_expires_at, buy_range_telegram_channel_id,
        analysis_id, author_id, status,
        contract_url, alert_image_url,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses(id, title, index_symbol)
      `)
      .eq("buy_range_status", "pending")
      .eq("buy_range_alert_sent", false)
      .eq("status", "active");

    if (fetchErr) {
      console.error("[buy-range-checker] ❌ Failed to fetch pending alerts:", fetchErr.message);
      return new Response(
        JSON.stringify({ ok: false, error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pendingCount = trades?.length ?? 0;
    console.log(`[buy-range-checker] Found ${pendingCount} pending buy range alert(s) to check`);

    if (pendingCount === 0) {
      return new Response(
        JSON.stringify({ ok: true, checked: 0, alerts_sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = { checked: 0, alerts_sent: 0, images_sent: 0, text_fallbacks: 0, errors: 0, skipped: 0 };

    for (const trade of trades!) {
      results.checked++;

      const currentPrice = trade.current_contract ?? 0;
      const rangeMin = trade.buy_range_min ?? 0;
      const rangeMax = trade.buy_range_max ?? 0;

      console.log(`[buy-range-checker] Trade ${trade.id}: current=${currentPrice} range=[${rangeMin}, ${rangeMax}]`);

      if (currentPrice <= 0 || rangeMin <= 0 || rangeMax <= 0) {
        console.log(`[buy-range-checker]   ⏩ Skipping — missing price data`);
        results.skipped++;
        continue;
      }

      const priceInRange = currentPrice >= rangeMin && currentPrice <= rangeMax;

      if (!priceInRange) {
        console.log(`[buy-range-checker]   ⏩ Price ${currentPrice} not in range [${rangeMin}, ${rangeMax}]`);
        results.skipped++;
        continue;
      }

      console.log(`[buy-range-checker]   🎯 PRICE HITS RANGE! currentPrice=${currentPrice} in [${rangeMin}, ${rangeMax}]`);

      // ── Resolve Telegram channel ─────────────────────────────────────────
      let channelId: string | null = null;

      if (trade.buy_range_telegram_channel_id) {
        const { data: ch } = await supabase
          .from("telegram_channels")
          .select("channel_id")
          .eq("id", trade.buy_range_telegram_channel_id)
          .eq("enabled", true)
          .maybeSingle();
        channelId = ch?.channel_id ?? null;
      }

      if (!channelId) {
        const { data: channels } = await supabase
          .from("telegram_channels")
          .select("channel_id")
          .eq("user_id", trade.author_id)
          .eq("enabled", true)
          .limit(1);
        channelId = channels?.[0]?.channel_id ?? null;
      }

      if (!channelId) {
        console.warn(`[buy-range-checker]   ⚠️  No Telegram channel for trade ${trade.id} — marking hit`);
        await supabase
          .from("index_trades")
          .update({
            buy_range_status: "hit",
            buy_range_hit_at: new Date().toISOString(),
            buy_range_alert_sent: false,
          })
          .eq("id", trade.id);
        results.skipped++;
        continue;
      }

      // ── Build caption ────────────────────────────────────────────────────
      const caption = buildPriceHitsCaption(trade, currentPrice, BASE_URL);

      // ── Try image send ───────────────────────────────────────────────────
      let imageSent = false;

      // Prefer the pre-generated snapshot URL (instant) over on-demand rendering.
      // alert_image_url is set by POST /api/indices/trades/[id]/snapshot-image.
      // contract_url is set by the generate-trade-snapshot edge function at trade creation.
      const snapshotUrl: string | null = trade.alert_image_url || trade.contract_url || null;

      if (snapshotUrl) {
        console.log(`[buy-range-checker]   ⚡ Using pre-generated snapshot URL — calling sendPhoto with URL`);
        try {
          await sendTelegramPhotoUrl(botToken, channelId, snapshotUrl, caption);
          imageSent = true;
          results.images_sent++;
          console.log(`[buy-range-checker]   ✅ PHOTO (URL) SENT to ${channelId}`);
        } catch (urlErr: any) {
          console.error(`[buy-range-checker]   ❌ sendPhoto (URL) failed: ${urlErr.message} — falling back to on-demand generation`);
        }
      }

      // On-demand generation fallback: fetch + upload bytes if no snapshot URL or URL send failed
      if (!imageSent && !BASE_URL.includes('localhost')) {
        console.log(`[buy-range-checker]   📸 On-demand image generation — tradeId: ${trade.id}`);
        try {
          const imgBuffer = await fetchImageBuffer(trade.id, BASE_URL);

          if (imgBuffer && imgBuffer.byteLength > 1024) {
            console.log(`[buy-range-checker]   📸 Image ready (${imgBuffer.byteLength} bytes) — calling sendPhoto (bytes)`);
            await sendTelegramPhotoBytes(botToken, channelId, imgBuffer, caption);
            imageSent = true;
            results.images_sent++;
            console.log(`[buy-range-checker]   ✅ PHOTO (bytes) SENT to ${channelId}`);
          } else {
            console.warn(`[buy-range-checker]   ⚠️  Image buffer empty or too small — falling back to text`);
          }
        } catch (imgErr: any) {
          console.error(`[buy-range-checker]   ❌ On-demand image/sendPhoto failed: ${imgErr.message} — falling back to text`);
        }
      } else if (!imageSent) {
        console.log(`[buy-range-checker]   ⚠️  BASE_URL is localhost and no snapshot URL — skipping image`);
      }

      // ── Text fallback if image not sent ──────────────────────────────────
      if (!imageSent) {
        try {
          const telegramRes = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: channelId,
                text: caption,
                parse_mode: "HTML",
                disable_web_page_preview: true,
              }),
            }
          );

          const telegramBody = await telegramRes.json();

          if (!telegramRes.ok || !telegramBody.ok) {
            console.error(`[buy-range-checker]   ❌ TEXT SEND FAILED:`, JSON.stringify(telegramBody));
            results.errors++;
            continue;
          }

          results.text_fallbacks++;
          console.log(`[buy-range-checker]   ✅ TEXT FALLBACK SENT — message_id: ${telegramBody.result?.message_id}`);
        } catch (textErr: any) {
          console.error(`[buy-range-checker]   ❌ Text send exception: ${textErr.message}`);
          results.errors++;
          continue;
        }
      }

      // ── Mark alert as hit + sent ─────────────────────────────────────────
      const updatePayload: Record<string, unknown> = {
        buy_range_status: "hit",
        buy_range_hit_at: new Date().toISOString(),
        buy_range_alert_sent: true,
        buy_range_image_sent: imageSent,
        telegram_image_sent_at: imageSent ? new Date().toISOString() : undefined,
        telegram_image_error: imageSent ? null : 'Image failed — text fallback sent',
      };
      // Remove undefined keys so Supabase doesn't send them
      Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);

      await supabase
        .from("index_trades")
        .update(updatePayload)
        .eq("id", trade.id);

      console.log(`[buy-range-checker]   ✅ Trade ${trade.id} marked buy_range_status=hit, image=${imageSent}`);
      results.alerts_sent++;
    }

    const summary = {
      ok: true,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ...results,
    };

    console.log(`[buy-range-checker] ══════════════════════════════════════════`);
    console.log(`[buy-range-checker] COMPLETED:`, summary);

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[buy-range-checker] ❌ Fatal error:", err.message, err.stack);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Image fetching ───────────────────────────────────────────────────────────

async function fetchImageBuffer(tradeId: string, baseUrl: string): Promise<ArrayBuffer | null> {
  const url = `${baseUrl}/api/indices/trades/${tradeId}/generate-image`;

  console.log(`[buy-range-checker] Fetching image from: ${url}`);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(28_000),
    headers: { Accept: "image/png" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[buy-range-checker] Image fetch HTTP ${res.status}: ${body.substring(0, 300)}`);
    return null;
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[buy-range-checker] Unexpected content-type "${ct}": ${body.substring(0, 200)}`);
    return null;
  }

  return res.arrayBuffer();
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function sendTelegramPhotoUrl(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption: string
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: caption.substring(0, 1024),
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendPhoto (URL) error (${res.status}): ${err}`);
  }

  const body = await res.json();
  if (!body.ok) {
    throw new Error(`Telegram sendPhoto (URL) rejected: ${JSON.stringify(body)}`);
  }
}

async function sendTelegramPhotoBytes(
  botToken: string,
  chatId: string,
  pngBytes: ArrayBuffer,
  caption: string
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([pngBytes], { type: "image/png" }), "alert.png");
  form.append("caption", caption.substring(0, 1024));
  form.append("parse_mode", "HTML");

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendPhoto error (${res.status}): ${err}`);
  }

  const body = await res.json();
  if (!body.ok) {
    throw new Error(`Telegram sendPhoto rejected: ${JSON.stringify(body)}`);
  }
}

// ─── Caption builder ─────────────────────────────────────────────────────────

function buildPriceHitsCaption(trade: any, currentPrice: number, baseUrl: string): string {
  const author   = trade.author as { full_name?: string } | null;
  const analysis = trade.analysis as { id?: string; title?: string; index_symbol?: string } | null;

  const symbol     = analysis?.index_symbol ?? trade.underlying_index_symbol ?? "";
  const ticker     = trade.polygon_option_ticker?.replace(/^O:/, "") ?? "";
  const optionType = (trade.option_type ?? trade.direction ?? "").toUpperCase();
  const strike     = trade.strike ? Number(trade.strike).toFixed(0) : "";
  const expiry     = trade.expiry
    ? new Date(trade.expiry).toLocaleDateString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
      })
    : "";
  const entryPrice = trade.entry_price
    ?? (trade.entry_contract_snapshot?.price ?? trade.entry_contract_snapshot?.mid ?? 0);

  const analysisLink = analysis?.id ? `${baseUrl}/dashboard/analysis/${analysis.id}` : null;
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  let msg = `🎯 <b>Price Hits Buy Range</b>\n\n`;
  msg += `<b>${symbol} Contract Alert</b>\n`;
  if (ticker)   msg += `<b>Contract:</b> ${ticker}\n`;
  msg += `<b>Type:</b> ${optionType}\n`;
  if (strike)   msg += `<b>Strike:</b> $${strike}\n`;
  if (expiry)   msg += `<b>Expiration:</b> ${expiry}\n`;
  msg += `<b>Current Price:</b> $${currentPrice.toFixed(2)}\n`;
  msg += `<b>Buy Range:</b> $${Number(trade.buy_range_min).toFixed(2)} – $${Number(trade.buy_range_max).toFixed(2)}\n`;
  if (entryPrice > 0) msg += `<b>Entry Price:</b> $${Number(entryPrice).toFixed(2)}\n`;
  if (author?.full_name) msg += `<b>Analyst:</b> ${author.full_name}\n`;
  if (analysisLink)      msg += `<b>Analysis:</b> <a href="${analysisLink}">View</a>\n`;
  msg += `<b>Time:</b> ${now} ET\n`;

  return msg.length > 1020 ? msg.substring(0, 1020) + "…" : msg;
}
