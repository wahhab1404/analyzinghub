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

// ── Polygon option premium ──────────────────────────────────────────────────

async function fetchOptionPremium(
  underlying: string,
  contract: string,
  polygonKey: string
): Promise<number | null> {
  try {
    const u = underlying.replace(/^O:/, "").toUpperCase();
    const c = contract.startsWith("O:") ? contract : `O:${contract}`;
    const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(u)}/${encodeURIComponent(c)}?apiKey=${polygonKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.results;
    if (!r) return null;

    const bid = Number(r.last_quote?.bid ?? 0);
    const ask = Number(r.last_quote?.ask ?? 0);
    const mid =
      bid > 0 && ask > 0 ? (bid + ask) / 2 : Number(r.last_quote?.midpoint ?? 0) || 0;
    const last  = Number(r.last_trade?.price ?? 0);
    const close = Number(r.day?.close ?? r.session?.close ?? 0);

    const premium = mid > 0 ? mid : last > 0 ? last : close > 0 ? close : 0;
    return premium > 0 ? parseFloat(premium.toFixed(4)) : null;
  } catch {
    return null;
  }
}

// ── Telegram sender ─────────────────────────────────────────────────────────

async function sendTelegram(
  supabaseUrl: string,
  serviceKey: string,
  chatId: string,
  text: string
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/telegram-sender`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result?.message_id?.toString() ?? null;
  } catch {
    return null;
  }
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
  const appUrl      = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://analyzhub.com";

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

  // 3. Fetch prices.
  //    - Stock trades  → underlying stock snapshot (fed to update_trade_price).
  //    - Option trades → the OPTION contract premium via its own snapshot
  //      (fed to update_option_trade_price). Using the stock price for an
  //      option premium is wrong; the contract is what the analyst tracks.
  const marketOpen = isMarketOpen();
  const stockSymbols = [
    ...new Set(
      activeTrades
        .filter((t: any) => t.trade_type !== "option")
        .map((t: any) => t.symbol as string)
    ),
  ];
  const stockPrices = marketOpen ? await fetchStockPrices(stockSymbols, polygonKey) : {};

  let updated = 0;

  for (const trade of activeTrades) {
    const isOption = trade.trade_type === "option";

    // Resolve the price relevant to this trade.
    let price: number | null = null;
    if (isOption) {
      const contract   = trade.option_details?.contract_symbol as string | undefined;
      const underlying = (trade.option_details?.underlying_symbol ?? trade.symbol) as string;
      if (marketOpen && contract) {
        price = await fetchOptionPremium(underlying, contract, polygonKey);
      }
    } else {
      const p = stockPrices[trade.symbol];
      price = p && p > 0 ? p : null;
    }

    if (!price || price <= 0) continue;

    const { data: result, error: rpcErr } = isOption
      ? await supabase.rpc("update_option_trade_price", {
          p_trade_id:       trade.id,
          p_current_premium: price,
        })
      : await supabase.rpc("update_trade_price", {
          p_trade_id:      trade.id,
          p_current_price: price,
        });

    if (rpcErr) {
      console.error(`[trades-tracker] RPC error for ${trade.id}:`, rpcErr);
      continue;
    }

    updated++;
    const r = result as any;

    // Resolve Telegram channel for alerts
    let chatId: string | null = null;
    let channelDbId: string | null = null;
    if (trade.telegram_channel_id) {
      const { data: ch } = await supabase
        .from("telegram_channels")
        .select("id, channel_id")
        .eq("id", trade.telegram_channel_id)
        .maybeSingle();
      if (ch) { chatId = ch.channel_id; channelDbId = ch.id; }
    }

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
        if (chatId) {
          msgId = await sendTelegram(
            supabaseUrl, serviceKey, chatId,
            buildStopMsg(trade.symbol, trade.stop_loss, price)
          );
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
      // Re-fetch updated targets to find newly hit ones
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
            if (chatId) {
              msgId = await sendTelegram(
                supabaseUrl, serviceKey, chatId,
                buildTargetMsg(trade.symbol, t.label, t.price, price, trade.entry_price)
              );
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
        if (chatId) {
          msgId = await sendTelegram(
            supabaseUrl, serviceKey, chatId,
            buildOptionWinMsg(trade.symbol, r.max_profit, trade.option_details.entry_premium)
          );
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
