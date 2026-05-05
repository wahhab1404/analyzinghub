/**
 * supabase/functions/indices-trade-tracker/index.ts
 *
 * Runs every minute via cron, but loops internally every ~1 second for 55 s,
 * so alert dispatch fires within 1–2 s of a new high being detected rather
 * than up to 60 s later.
 *
 * Architecture:
 *   PRIMARY price source  — realtime-pricing-service (Node.js WebSocket, always-on)
 *                           calls process_streaming_price_update() on every tick.
 *   THIS FUNCTION         — alert dispatcher + REST fallback
 *     • Every tick (≈1 s): re-reads fresh trade state, dispatches pending alerts.
 *     • REST fallback:      only when streaming is stale (>90 s), rate-limited to
 *                           once per 30 s per trade to avoid Polygon rate limits.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const TICK_MS               = 1_000;   // alert-dispatch interval
const LOOP_DURATION_MS      = 55_000;  // run for 55 s per cron invocation
const STREAM_FRESH_WINDOW_S = 90;      // streaming considered stale after 90 s
const REST_COOLDOWN_MS      = 30_000;  // min gap between REST calls per trade

// ── HELPERS ───────────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  const now = new Date();
  if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 870 && mins < 1260; // 14:30–21:00 UTC
}

function isStreamingFresh(lastStreamEventAt: string | null): boolean {
  if (!lastStreamEventAt) return false;
  return (Date.now() - new Date(lastStreamEventAt).getTime()) / 1000 < STREAM_FRESH_WINDOW_S;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    console.log("🔄 [tracker] Starting 55-second loop...");

    const results = { ticks: 0, alertsSent: 0, restUpdated: 0, errors: 0, expired: 0 };
    const deadline = Date.now() + LOOP_DURATION_MS;

    // Per-trade REST rate limiter: tradeId → last REST call timestamp
    const lastRestAt = new Map<string, number>();

    // ── TICK LOOP ─────────────────────────────────────────────────────────────
    while (Date.now() < deadline) {
      const tickStart = Date.now();
      results.ticks++;

      try {
        // Always refresh freshness flags across all active trades
        await supabase.rpc("update_streaming_freshness", {
          p_degraded_after_seconds: 60,
          p_stale_after_seconds:    300,
        });

        const { data: trades } = await supabase
          .from("index_trades")
          .select(`
            *,
            analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id),
            author:profiles!author_id(id, full_name)
          `)
          .eq("status", "active")
          .not("polygon_option_ticker", "is", null);

        if (!trades || trades.length === 0) {
          // No active trades — still loop in case one opens
          await sleep(Math.max(0, TICK_MS - (Date.now() - tickStart)));
          continue;
        }

        const marketIsOpen = isMarketOpen();

        for (const trade of trades) {
          try {
            // ── EXPIRY ──────────────────────────────────────────────────────
            if (trade.expiry) {
              const expiryDate = new Date(trade.expiry + "T21:00:00Z");
              if (new Date() > expiryDate) {
                await handleTradeExpiration(supabase, trade, supabaseUrl, supabaseKey);
                results.expired++;
                continue;
              }
            }

            if (!marketIsOpen || trade.is_using_manual_price) continue;

            const streamFresh = isStreamingFresh(trade.last_stream_event_at);

            if (streamFresh) {
              // Streaming is live — just dispatch alerts from current DB state
              await dispatchPendingAlerts(supabase, trade, supabaseUrl, supabaseKey, results);
            } else {
              // Streaming stale — REST fallback, rate-limited per trade
              const lastRest = lastRestAt.get(trade.id) ?? 0;
              if (Date.now() - lastRest >= REST_COOLDOWN_MS) {
                lastRestAt.set(trade.id, Date.now());
                await runRestFallback(supabase, trade, supabaseUrl, supabaseKey, results);
              } else {
                // Still dispatch alerts even if we're not fetching new prices
                await dispatchPendingAlerts(supabase, trade, supabaseUrl, supabaseKey, results);
              }
            }
          } catch (tradeErr: any) {
            console.error(`❌ Trade ${trade.id}:`, tradeErr.message);
            results.errors++;
          }
        }
      } catch (tickErr: any) {
        console.error(`❌ Tick ${results.ticks} error:`, tickErr.message);
        results.errors++;
      }

      // Sleep for the remainder of the tick interval
      const elapsed = Date.now() - tickStart;
      const remaining = TICK_MS - elapsed;
      if (remaining > 50 && Date.now() + remaining < deadline) {
        await sleep(remaining);
      } else if (Date.now() >= deadline) {
        break;
      }
    }

    console.log(`✅ [tracker] Done — ${results.ticks} ticks, ${results.alertsSent} alerts`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ [tracker] Fatal:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── REST FALLBACK ─────────────────────────────────────────────────────────────

async function runRestFallback(
  supabase: any, trade: any, supabaseUrl: string, supabaseKey: string, results: any
): Promise<void> {
  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) return;

  const quote = await fetchPolygonSnapshot(trade.polygon_option_ticker, apiKey);
  if (!quote) return;

  const price = quote.mid ?? quote.last ?? 0;
  if (price <= 0) return;

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "process_streaming_price_update",
    {
      p_trade_id:       trade.id,
      p_current_price:  price,
      p_premium_source: "snapshot",
      p_bid:            quote.bid || null,
      p_ask:            quote.ask || null,
      p_last_trade:     quote.last || null,
      p_event_ts:       new Date().toISOString(),
    }
  );

  if (rpcError) { results.errors++; return; }
  results.restUpdated++;

  const { data: refreshed } = await supabase
    .from("index_trades")
    .select("*")
    .eq("id", trade.id)
    .single();

  if (refreshed) {
    await dispatchPendingAlerts(
      supabase,
      { ...trade, ...refreshed, _rpcResult: rpcResult },
      supabaseUrl, supabaseKey, results
    );
  }
}

// ── ALERT DISPATCH ────────────────────────────────────────────────────────────

async function dispatchPendingAlerts(
  supabase: any, trade: any, supabaseUrl: string, supabaseKey: string, results: any
): Promise<void> {
  const rpcResult = trade._rpcResult;
  const appBaseUrl =
    Deno.env.get("APP_BASE_URL") ??
    Deno.env.get("NEXT_PUBLIC_SITE_URL") ??
    "https://analyzhub.com";

  // ── WIN ALERT ────────────────────────────────────────────────────────────
  const justWon = rpcResult?.newly_won === true || (
    trade.is_winning_trade === true &&
    trade.win_at &&
    (Date.now() - new Date(trade.win_at).getTime()) < 120_000
  );

  if (justWon) {
    const { count } = await supabase
      .from("index_trade_updates")
      .select("id", { count: "exact", head: true })
      .eq("trade_id", trade.id)
      .eq("update_type", "milestone")
      .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());

    if ((count ?? 0) === 0) {
      results.alertsSent++;
      await supabase.from("index_trade_updates").insert({
        trade_id:    trade.id,
        update_type: "milestone",
        title:       "$100 Profit Milestone",
        body:        `🎉 Winning Trade! Max profit reached $${(trade.max_profit ?? 0).toFixed(2)} — صفقة رابحة`,
        changes: { type: "winning_trade", max_profit: trade.max_profit, high_watermark: trade.contract_high_since },
      });

      const snapshotUrl = await tryGenerateSnapshot(supabase, supabaseUrl, supabaseKey, trade.id, false, appBaseUrl);
      const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
      if (channelId && trade.telegram_send_enabled !== false) {
        await queueTelegramMessage(supabase, "winning_trade", trade.id, channelId, {
          tradeId: trade.id, max_profit: trade.max_profit,
          high_watermark: trade.contract_high_since, snapshotUrl,
        });
      }
    }
  }

  // ── PEAK ALERT ───────────────────────────────────────────────────────────
  if (!justWon) {
    const newHigh    = parseFloat(trade.contract_high_since ?? trade.max_contract_price ?? "0") || 0;
    const entryPrice = parseFloat(
      trade.entry_contract_snapshot?.mid ??
      trade.entry_contract_snapshot?.price ??
      trade.entry_contract_snapshot?.last ?? "0"
    ) || 0;

    const gainPct       = entryPrice > 0 ? (newHigh - entryPrice) / entryPrice : 0;
    const lastAlertedAt = trade.last_peak_alert_at ? new Date(trade.last_peak_alert_at) : null;
    const lastPrice     = parseFloat(trade.last_peak_alert_price ?? "0") || 0;
    const minsSinceLast = lastAlertedAt ? (Date.now() - lastAlertedAt.getTime()) / 60_000 : Infinity;

    const meetsGain        = gainPct >= 0.10;
    const meetsImprovement = lastPrice === 0 || newHigh >= lastPrice * 1.20;
    const meetsCooldown    = minsSinceLast >= 5;

    if (meetsGain && meetsImprovement && meetsCooldown && newHigh > 0) {
      results.alertsSent++;

      await supabase.from("index_trade_updates").insert({
        trade_id:    trade.id,
        update_type: "new_high",
        title:       `New High: $${newHigh.toFixed(4)}`,
        body:        `New high! $${newHigh.toFixed(4)} (+${(gainPct * 100).toFixed(1)}% from entry)`,
        changes:     { type: "new_high", price: newHigh, gain_pct: gainPct },
      });

      // Record BEFORE queuing — prevents duplicate on crash/retry
      await supabase
        .from("index_trades")
        .update({ last_peak_alert_price: newHigh, last_peak_alert_at: new Date().toISOString() })
        .eq("id", trade.id);

      const snapshotUrl = await tryGenerateSnapshot(supabase, supabaseUrl, supabaseKey, trade.id, true, appBaseUrl);
      const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
      if (channelId && trade.telegram_send_enabled !== false) {
        await queueTelegramMessage(supabase, "new_high", trade.id, channelId, {
          tradeId: trade.id, highPrice: newHigh, snapshotUrl,
        });
      }

      console.log(`🚀 [alerts] PEAK queued — trade ${trade.id}: $${newHigh.toFixed(4)} (+${(gainPct * 100).toFixed(1)}%)`);
    }
  }
}

// ── EXPIRY ────────────────────────────────────────────────────────────────────

async function handleTradeExpiration(
  supabase: any, trade: any, supabaseUrl: string, supabaseKey: string
): Promise<void> {
  const { data: result, error } = await supabase.rpc("finalize_trade_canonical", { p_trade_id: trade.id });
  if (error) { console.error(`Failed to finalize ${trade.id}:`, error); return; }

  await supabase.from("index_trades").update({
    status: "expired", closed_at: new Date().toISOString(),
    closure_reason: "EXPIRED", data_freshness_status: "stale",
  }).eq("id", trade.id);

  await supabase.from("index_trade_updates").insert({
    trade_id: trade.id, update_type: "expired", title: "Trade Expired",
    body: `Trade expired. Final P/L: $${result.final_pnl.toFixed(2)} (${result.outcome.toUpperCase()})`,
    changes: { type: "expired", final_pnl: result.final_pnl, outcome: result.outcome },
  });

  const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
  if (channelId && trade.telegram_send_enabled !== false) {
    await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
      tradeId: trade.id, outcome: result.outcome, pnl: result.final_pnl, condition: "Expired",
    });
  }
}

// ── POLYGON REST ──────────────────────────────────────────────────────────────

async function fetchPolygonSnapshot(
  ticker: string, apiKey: string
): Promise<{ bid: number; ask: number; mid: number | null; last: number } | null> {
  try {
    const clean = ticker.startsWith("O:") ? ticker : `O:${ticker}`;
    const res = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(clean)}?apiKey=${apiKey}`
    );
    if (res.ok) {
      const d = await res.json();
      if (d.status === "OK" && d.results) {
        const lq = d.results.last_quote ?? {};
        const bid = Number(lq.bid ?? 0), ask = Number(lq.ask ?? 0), last = Number(lq.last_price ?? 0);
        if (bid > 0 || ask > 0 || last > 0) {
          return { bid, ask, last, mid: bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null };
        }
      }
    }
    const qRes = await fetch(
      `https://api.polygon.io/v3/quotes/${encodeURIComponent(clean)}?limit=1&order=desc&sort=timestamp&apiKey=${apiKey}`
    );
    if (qRes.ok) {
      const qd = await qRes.json();
      if (qd.status === "OK" && qd.results?.length > 0) {
        const q = qd.results[0];
        const bid = Number(q.bid_price ?? 0), ask = Number(q.ask_price ?? 0);
        return { bid, ask, last: 0, mid: bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null };
      }
    }
  } catch (e: any) {
    console.error(`Polygon error for ${ticker}:`, e.message);
  }
  return null;
}

// ── SNAPSHOT ──────────────────────────────────────────────────────────────────

async function tryGenerateSnapshot(
  supabase: any, supabaseUrl: string, supabaseKey: string,
  tradeId: string, isNewHigh: boolean, appBaseUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ tradeId, isNewHigh, appBaseUrl }),
    });
    if (res.ok) {
      const r = await res.json();
      if (r.imageUrl) {
        await supabase.from("index_trades").update({ contract_url: r.imageUrl }).eq("id", tradeId);
        return r.imageUrl;
      }
    }
  } catch (e: any) {
    console.warn(`Snapshot failed for ${tradeId}:`, e.message);
  }
  return null;
}

// ── QUEUE TELEGRAM ────────────────────────────────────────────────────────────

async function queueTelegramMessage(
  supabase: any, messageType: string, tradeId: string, channelId: string, payload: any
): Promise<void> {
  try {
    const { data: fullTrade } = await supabase
      .from("index_trades")
      .select("*, current_contract_snapshot, author:profiles!author_id(id, full_name, avatar_url), analysis:index_analyses!analysis_id(id, title, index_symbol)")
      .eq("id", tradeId)
      .single();

    if (!fullTrade) return;
    if (payload.snapshotUrl) fullTrade.contract_url = payload.snapshotUrl;

    let actualChannelId = channelId;
    if (/^[0-9a-f-]{36}$/i.test(channelId)) {
      const { data: ch } = await supabase.from("telegram_channels").select("channel_id").eq("id", channelId).single();
      if (ch?.channel_id) actualChannelId = ch.channel_id;
    }

    await supabase.from("telegram_outbox").insert({
      message_type: messageType, payload: { ...payload, trade: fullTrade },
      channel_id: actualChannelId, status: "pending", priority: 5,
      next_retry_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Queue telegram error:", e.message);
  }
}
