/**
 * supabase/functions/trades-price-tracker/index.ts
 *
 * Scheduled edge function — runs every minute via cron.
 * Responsibilities:
 *   1. Fetch all published/active trades
 *   2. Pull latest market prices from Polygon REST snapshot
 *   3. Update current_price, highest/lowest watermarks
 *   4. Detect target hits and stop-loss hits (via update_trade_price RPC)
 *   5. Send Telegram alerts for new events (deduplication via trade_alerts)
 *   6. Expire option trades past their expiration_date
 *   7. Check $100 win threshold for option trades
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Market hours ────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 870 && mins < 1260; // 14:30–21:00 UTC
}

// ── Polygon snapshot ────────────────────────────────────────────────────────

async function fetchStockPrices(
  symbols: string[],
  polygonKey: string
): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols.join(",")}&apiKey=${polygonKey}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();
    const prices: Record<string, number> = {};
    for (const t of json.tickers ?? []) {
      const p = t.day?.c ?? t.prevDay?.c;
      if (p && p > 0) prices[t.ticker] = p;
    }
    return prices;
  } catch {
    return {};
  }
}

// ── Telegram sender (photo with text fallback) ──────────────────────────────

async function getBotToken(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("admin_settings")
    .select("setting_value")
    .eq("setting_key", "telegram_bot_token")
    .maybeSingle();
  return data?.setting_value ?? Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
}

async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  imageUrl: string,
  caption: string
): Promise<string | null> {
  // 1. Fetch PNG from generate-image route
  let imageBytes: ArrayBuffer | null = null;
  try {
    const imgRes = await fetch(imageUrl);
    if (imgRes.ok) imageBytes = await imgRes.arrayBuffer();
    else console.warn("[tracker] image fetch failed:", imgRes.status);
  } catch (e) {
    console.warn("[tracker] image fetch error:", e);
  }

  if (imageBytes && imageBytes.byteLength > 0) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([imageBytes], { type: "image/png" }), "trade-alert.png");

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const json = await res.json();
      return json?.result?.message_id?.toString() ?? null;
    }
    console.warn("[tracker] sendPhoto failed:", await res.text());
  }

  // 2. Fallback: plain text
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML" }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.result?.message_id?.toString() ?? null;
}

// Legacy alias used by older code paths
async function sendTelegram(
  _supabaseUrl: string,
  _serviceKey: string,
  chatId: string,
  text: string,
  botToken?: string,
  imageUrl?: string
): Promise<string | null> {
  if (!botToken) return null;
  if (imageUrl) return sendTelegramPhoto(botToken, chatId, imageUrl, text);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.result?.message_id?.toString() ?? null;
}

// ── Target-hit message ──────────────────────────────────────────────────────

function buildTargetMsg(
  symbol: string,
  label: string,
  targetPrice: number,
  currentPrice: number,
  entry: number | null
): string {
  let msg = `🎯 <b>تم تحقيق الهدف / Target Hit!</b>\n\n`;
  msg += `📌 <code>${symbol}</code>\n`;
  msg += `✅ <b>${label}</b>: <code>$${targetPrice.toFixed(2)}</code>\n`;
  msg += `💹 السعر الحالي / Current: <code>$${currentPrice.toFixed(2)}</code>\n`;
  if (entry) {
    const pct = (((currentPrice - entry) / entry) * 100).toFixed(2);
    msg += `📊 النسبة / Return: <code>+${pct}%</code>\n`;
  }
  return msg;
}

function buildStopMsg(symbol: string, stopPrice: number, currentPrice: number): string {
  let msg = `🛑 <b>وقف الخسارة / Stop Loss Hit</b>\n\n`;
  msg += `📌 <code>${symbol}</code>\n`;
  msg += `🛑 Stop: <code>$${stopPrice.toFixed(2)}</code>\n`;
  msg += `💹 Current: <code>$${currentPrice.toFixed(2)}</code>\n`;
  msg += `<i>الصفقة مغلقة / Trade closed.</i>`;
  return msg;
}

function buildOptionWinMsg(symbol: string, maxProfit: number, entry: number): string {
  let msg = `🎉 <b>هدف $100 محقق / $100 Win Threshold Met!</b>\n\n`;
  msg += `📌 <code>${symbol}</code>\n`;
  msg += `💰 Max Profit: <code>$${maxProfit.toFixed(2)}</code>\n`;
  msg += `📥 Entry Premium: <code>$${entry.toFixed(2)}</code>\n`;
  return msg;
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const polygonKey  = Deno.env.get("POLYGON_API_KEY") ?? "";
  const appUrl      = Deno.env.get("APP_BASE_URL") ?? Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://analyzinghub.com";

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log("[trades-tracker] Starting cycle...");

  // 1. Fetch all active/published non-testing trades
  const { data: trades, error: fetchErr } = await supabase
    .from("trades")
    .select(`
      *,
      option_details:option_trade_details(*),
      author:profiles!user_id(id, full_name),
      analysis:analyses!analysis_id(id, title)
    `)
    .in("status", ["published", "active"])
    .eq("is_testing", false);

  if (fetchErr) {
    console.error("[trades-tracker] fetch error:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: CORS_HEADERS });
  }

  if (!trades || trades.length === 0) {
    console.log("[trades-tracker] No active trades.");
    return new Response(JSON.stringify({ updated: 0 }), { status: 200, headers: CORS_HEADERS });
  }

  // 2. Expire option trades past expiration_date
  const today = new Date().toISOString().slice(0, 10);
  const expiredOptionIds = trades
    .filter((t: any) => t.trade_type === "option" && t.option_details?.expiration_date < today)
    .map((t: any) => t.id);

  if (expiredOptionIds.length > 0) {
    await supabase
      .from("trades")
      .update({ status: "expired", completed_at: new Date().toISOString() })
      .in("id", expiredOptionIds);
    console.log(`[trades-tracker] Expired ${expiredOptionIds.length} option trades.`);
  }

  // Filter to tradeable (skip just-expired)
  const activeTrades = trades.filter((t: any) => !expiredOptionIds.includes(t.id));
  if (!activeTrades.length) {
    return new Response(JSON.stringify({ updated: 0, expired: expiredOptionIds.length }), { status: 200, headers: CORS_HEADERS });
  }

  // 3. Fetch prices
  const symbols = [...new Set(activeTrades.map((t: any) => t.symbol as string))];
  const prices  = isMarketOpen() ? await fetchStockPrices(symbols, polygonKey) : {};

  let updated = 0;

  for (const trade of activeTrades) {
    const price = prices[trade.symbol];
    if (!price || price <= 0) continue;

    const isOption = trade.trade_type === "option";
    const rpc = isOption ? "update_option_trade_price" : "update_trade_price";

    const { data: result, error: rpcErr } = await supabase.rpc(rpc, {
      p_trade_id:      trade.id,
      p_current_price: price,
    });

    if (rpcErr) {
      console.error(`[trades-tracker] RPC error for ${trade.id}:`, rpcErr);
      continue;
    }

    updated++;
    const r = result as any;

    // Resolve Telegram channel + bot token for alerts
    let chatId: string | null = null;
    let channelDbId: string | null = null;
    if (trade.telegram_channel_id) {
      const { data: ch } = await supabase
        .from("analyzer_telegram_channels")
        .select("id, telegram_channel_id")
        .eq("id", trade.telegram_channel_id)
        .maybeSingle();
      if (ch) { chatId = ch.telegram_channel_id; channelDbId = ch.id; }
    }

    // Lazy-load bot token once per cycle
    const botToken = chatId ? await getBotToken(supabase) : "";

    // 4. Alert: stop hit
    if (r?.stop_hit && trade.stop_loss) {
      const { data: dupCheck } = await supabase
        .from("trade_alerts")
        .select("id")
        .eq("trade_id", trade.id)
        .eq("alert_type", "stop_hit")
        .maybeSingle();

      if (!dupCheck) {
        let msgId: string | null = null;
        if (chatId && botToken) {
          const imageUrl = `${appUrl}/api/trades/${trade.id}/generate-image?event=stop_hit&price=${price}`;
          const caption  = buildStopMsg(trade.symbol, trade.stop_loss, price);
          msgId = await sendTelegramPhoto(botToken, chatId, imageUrl, caption);
        }
        await supabase.from("trade_alerts").insert({
          trade_id:            trade.id,
          alert_type:          "stop_hit",
          price,
          sent_to_channel_id:  channelDbId,
          telegram_message_id: msgId,
          status:              msgId ? "sent" : "failed",
        });
      }
    }

    // 5. Alert: target hits
    if (r?.any_target_hit) {
      const { data: freshTrade } = await supabase
        .from("trades")
        .select("targets")
        .eq("id", trade.id)
        .single();

      if (freshTrade?.targets) {
        for (let i = 0; i < freshTrade.targets.length; i++) {
          const t = freshTrade.targets[i];
          if (!t.hit) continue;

          const { data: dupCheck } = await supabase
            .from("trade_alerts")
            .select("id")
            .eq("trade_id", trade.id)
            .eq("alert_type", "target_hit")
            .eq("target_index", i)
            .maybeSingle();

          if (!dupCheck) {
            let msgId: string | null = null;
            if (chatId && botToken) {
              const imageUrl = `${appUrl}/api/trades/${trade.id}/generate-image?event=target_hit&price=${price}&target_index=${i}`;
              const caption  = buildTargetMsg(trade.symbol, t.label, t.price, price, trade.entry_price);
              msgId = await sendTelegramPhoto(botToken, chatId, imageUrl, caption);
            }
            await supabase.from("trade_alerts").insert({
              trade_id:            trade.id,
              alert_type:          "target_hit",
              target_index:        i,
              price,
              sent_to_channel_id:  channelDbId,
              telegram_message_id: msgId,
              status:              msgId ? "sent" : "failed",
            });
          }
        }
      }
    }

    // 6. Alert: option $100 win threshold
    if (isOption && r?.win_threshold_met && trade.option_details) {
      const { data: dupCheck } = await supabase
        .from("trade_alerts")
        .select("id")
        .eq("trade_id", trade.id)
        .eq("alert_type", "new_high")
        .maybeSingle();

      if (!dupCheck) {
        let msgId: string | null = null;
        if (chatId && botToken) {
          const imageUrl = `${appUrl}/api/trades/${trade.id}/generate-image?event=new_high&price=${price}`;
          const caption  = buildOptionWinMsg(trade.symbol, r.max_profit, trade.option_details.entry_premium);
          msgId = await sendTelegramPhoto(botToken, chatId, imageUrl, caption);
        }
        await supabase.from("trade_alerts").insert({
          trade_id:            trade.id,
          alert_type:          "new_high",
          price,
          sent_to_channel_id:  channelDbId,
          telegram_message_id: msgId,
          status:              msgId ? "sent" : "failed",
        });
      }
    }
  }

  console.log(`[trades-tracker] Done. Updated: ${updated}, Expired: ${expiredOptionIds.length}`);

  return new Response(
    JSON.stringify({ updated, expired: expiredOptionIds.length }),
    { status: 200, headers: CORS_HEADERS }
  );
});
