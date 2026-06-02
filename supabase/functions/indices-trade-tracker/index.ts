/**
 * supabase/functions/indices-trade-tracker/index.ts
 *
 * ROLE IN THE NEW ARCHITECTURE:
 *
 * Previously: sole price tracker — polled Polygon REST once/minute, updated
 * contract_high_since if new price > stored high. Missed all intra-minute peaks.
 *
 * Now: ALERT DISPATCHER + FALLBACK PRICE TRACKER
 *
 * The realtime-pricing-service (Node.js, always-on) is the PRIMARY price
 * tracker. It subscribes to Polygon WebSocket streams and calls the
 * process_streaming_price_update() RPC on every tick.
 *
 * This edge function is still invoked every minute by the cron job and does:
 *
 *   A) ALWAYS:
 *      - Check for expired trades and finalize them
 *      - Check DB state for pending win/new-high Telegram alerts
 *        (streaming may have detected a new high without alerting yet)
 *
 *   B) ONLY WHEN STREAMING IS STALE (last_stream_event_at older than 90 s):
 *      - Fall back to REST snapshot fetch
 *      - Call process_streaming_price_update() to keep DB accurate
 *      - Ensures no active trade goes dark if streaming is down
 *
 * HOW THIS FIXES INTRA-MINUTE PEAKS:
 *   The streaming service updates contract_high_since tick-by-tick as Polygon
 *   WebSocket events arrive. A price spike that appears and fades within a
 *   single minute is now captured the moment the WS event fires — not once
 *   per minute. This function only reads what streaming already wrote.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── MARKET HOURS ──────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  // Compute the current time in US Eastern, correctly accounting for EST/EDT.
  // A hardcoded UTC window is wrong half the year: during EDT (summer) the NYSE
  // regular session is 13:30–20:00 UTC, during EST (winter) it is 14:30–21:00 UTC.
  // Using America/New_York lets the runtime apply the right DST offset, so the
  // tracker no longer treats the first hour of summer trading (9:30–10:30 ET) as
  // closed — which previously froze all prices when streaming was also down.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;

  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some runtimes emit "24" at midnight
  const minute = parseInt(get("minute"), 10);
  const etMinutes = hour * 60 + minute;

  // Regular session: 9:30 AM (570) – 4:00 PM (960) ET.
  return etMinutes >= 570 && etMinutes < 960;
}

// ── FRESHNESS CHECK ───────────────────────────────────────────────────────────

const STREAM_FRESH_WINDOW_SECONDS = 90;

function isStreamingFresh(lastStreamEventAt: string | null): boolean {
  if (!lastStreamEventAt) return false;
  const ageSeconds = (Date.now() - new Date(lastStreamEventAt).getTime()) / 1000;
  return ageSeconds < STREAM_FRESH_WINDOW_SECONDS;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔄 [indices-trade-tracker] Starting cycle...");

    const { data: activeTrades, error: fetchError } = await supabase
      .from("index_trades")
      .select(`
        *,
        analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id),
        author:profiles!author_id(id, full_name)
      `)
      .eq("status", "active")
      .not("polygon_option_ticker", "is", null);

    if (fetchError) {
      console.error("❌ Failed to fetch active trades:", fetchError);
      throw fetchError;
    }

    // Always update freshness status across all active trades
    await supabase.rpc("update_streaming_freshness", {
      p_degraded_after_seconds: 60,
      p_stale_after_seconds: 300,
    });

    if (!activeTrades || activeTrades.length === 0) {
      console.log("✅ No active trades to track");
      return new Response(
        JSON.stringify({ success: true, message: "No active trades", tracked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Processing ${activeTrades.length} active trade(s)`);
    const marketIsOpen = isMarketOpen();
    console.log(`📊 Market: ${marketIsOpen ? "OPEN" : "CLOSED"}`);

    const results = {
      tracked:     activeTrades.length,
      restUpdated: 0,
      alertsSent:  0,
      errors:      0,
      expired:     0,
    };

    for (const trade of activeTrades) {
      try {
        console.log(`\n🔍 Trade ${trade.id} (${trade.polygon_option_ticker})`);

        // ── EXPIRY ────────────────────────────────────────────────────
        if (trade.expiry) {
          const expiryDate = new Date(trade.expiry + "T21:00:00Z");
          if (new Date() > expiryDate) {
            console.log(`⏰ Trade ${trade.id} expired`);
            await handleTradeExpiration(supabase, trade, supabaseUrl, supabaseKey);
            results.expired++;
            continue;
          }
        }

        if (!marketIsOpen) {
          console.log(`⏭️  Market closed — skip ${trade.id}`);
          continue;
        }

        // NOTE: We intentionally do NOT skip is_using_manual_price trades here.
        // A manual price is only a placeholder for when no live data exists
        // (market closed — already skipped above). With the market open and a
        // live quote available, process_streaming_price_update() resumes
        // auto-tracking and clears the flag, so the contract price never stays
        // frozen after a manual edit. (Previously this `continue` froze such
        // trades permanently.)

        // ── UNDERLYING INDEX PRICE ────────────────────────────────────
        // Always update regardless of streaming state — the streaming
        // service only tracks the options contract, never the index.
        const apiKey = Deno.env.get("POLYGON_API_KEY");
        if (apiKey && trade.polygon_underlying_index_ticker) {
          await updateUnderlyingPrice(supabase, trade, apiKey);
        }

        // ── STREAMING vs REST FALLBACK ────────────────────────────────
        // runRestFallback() below also writes last_stream_event_at (via the
        // process_streaming_price_update RPC, tagged premium_source='snapshot').
        // We must NOT treat our own fallback write as a live streaming event:
        // otherwise, while the realtime streaming service is down, the next cron
        // cycle sees a <90 s-old timestamp, assumes streaming recovered, takes
        // the "alert-check only" branch, and skips the price update — so peaks
        // refresh only every OTHER minute instead of every minute. Only a
        // genuine streaming event (any premium_source other than 'snapshot')
        // counts toward freshness; a real event flips premium_source back the
        // instant the stream recovers, so this still yields to live streaming.
        const lastWriteWasRestFallback = trade.premium_source === "snapshot";
        const streamingFresh =
          isStreamingFresh(trade.last_stream_event_at) && !lastWriteWasRestFallback;

        if (streamingFresh) {
          console.log(
            `✅ Trade ${trade.id}: streaming fresh ` +
            `(status=${trade.data_freshness_status}) — alert-check only`
          );
          await dispatchPendingAlerts(supabase, trade, supabaseUrl, supabaseKey, results);
        } else {
          console.log(
            `⚠️  Trade ${trade.id}: streaming stale ` +
            `(last=${trade.last_stream_event_at ?? "never"}) — REST fallback`
          );
          await runRestFallback(supabase, trade, supabaseUrl, supabaseKey, results);
        }
      } catch (tradeError: any) {
        console.error(`❌ Error processing trade ${trade.id}:`, tradeError.message);
        results.errors++;
      }
    }

    console.log("\n✅ [indices-trade-tracker] Completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ [indices-trade-tracker] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── REST FALLBACK ─────────────────────────────────────────────────────────────

async function runRestFallback(
  supabase: any,
  trade: any,
  supabaseUrl: string,
  supabaseKey: string,
  results: any
): Promise<void> {
  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) return;

  const quote = await fetchPolygonSnapshot(trade.polygon_option_ticker, apiKey);
  if (!quote) {
    console.log(`⚠️  No snapshot for ${trade.polygon_option_ticker}`);
    return;
  }

  const price = quote.mid ?? quote.last ?? 0;
  if (price <= 0) {
    console.log(`⚠️  Invalid price for trade ${trade.id}`);
    return;
  }

  console.log(
    `📡 [REST] ${trade.polygon_option_ticker}: ` +
    `bid=${quote.bid}, ask=${quote.ask}, mid=${quote.mid?.toFixed(4)}`
  );

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

  if (rpcError) {
    console.error(`❌ RPC error for trade ${trade.id}:`, rpcError);
    results.errors++;
    return;
  }

  console.log(`✅ REST fallback RPC result:`, rpcResult);
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
      supabaseUrl,
      supabaseKey,
      results
    );
  }
}

// ── ALERT DISPATCH ────────────────────────────────────────────────────────────

async function dispatchPendingAlerts(
  supabase: any,
  trade: any,
  supabaseUrl: string,
  supabaseKey: string,
  results: any
): Promise<void> {
  const rpcResult = trade._rpcResult;
  const appBaseUrl =
    Deno.env.get("APP_BASE_URL") ??
    Deno.env.get("NEXT_PUBLIC_SITE_URL") ??
    "https://analyzhub.com";

  // ── WIN ALERT ────────────────────────────────────────────────────────
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
      console.log(`🎉 [alerts] WIN — trade ${trade.id}`);
      results.alertsSent++;

      await supabase.from("index_trade_updates").insert({
        trade_id:    trade.id,
        update_type: "milestone",
        title:       "$100 Profit Milestone",
        body:        `🎉 Winning Trade! Max profit reached $${(trade.max_profit ?? 0).toFixed(2)} — صفقة رابحة`,
        changes: {
          type:           "winning_trade",
          max_profit:     trade.max_profit,
          high_watermark: trade.contract_high_since,
          mfe:            trade.mfe,
        },
      });

      const snapshotUrl = await tryGenerateSnapshot(
        supabase, supabaseUrl, supabaseKey, trade.id, false, appBaseUrl
      );
      const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
      if (channelId && trade.telegram_send_enabled !== false) {
        await queueTelegramMessage(supabase, "winning_trade", trade.id, channelId, {
          tradeId:        trade.id,
          max_profit:     trade.max_profit,
          high_watermark: trade.contract_high_since,
          mfe:            trade.mfe,
          snapshotUrl,
        });
      }
    }
  }

  // ── PEAK ALERT ───────────────────────────────────────────────────────
  // The platform displays contract_high_since live, so its card updates on
  // every new peak. Mirror that on Telegram: the FIRST qualifying high (gain
  // ≥ 5 % from entry) posts a fresh "قمة جديدة" alert; every subsequent new
  // high EDITS that same message in place so the channel always reflects the
  // live peak — no +10 % / 5-min throttle, no duplicate messages.
  if (!justWon) {
    const newHigh    = parseFloat(trade.contract_high_since ?? trade.max_contract_price ?? "0") || 0;
    const entryPrice = parseFloat(
      trade.entry_contract_snapshot?.mid ??
      trade.entry_contract_snapshot?.price ??
      trade.entry_contract_snapshot?.last ??
      "0"
    ) || 0;

    const gainPct   = entryPrice > 0 ? (newHigh - entryPrice) / entryPrice : 0;
    const lastPrice = parseFloat(trade.last_peak_alert_price ?? "0") || 0;
    const minsSinceLast = trade.last_peak_alert_at
      ? (Date.now() - new Date(trade.last_peak_alert_at).getTime()) / 60_000
      : Infinity;

    // An existing message we can edit in place (set after the first alert).
    const editMessageId = trade.peak_alert_message_id ?? null;
    const editChatId    = trade.peak_alert_chat_id ?? null;
    const canEdit       = !!editMessageId && !!editChatId;

    const meetsGain  = gainPct >= 0.05;
    // "Any new high": strictly above the last shown value by ≥ $0.01 (the
    // 2-decimal display precision) so we never re-render an identical card.
    const isNewPeak  = lastPrice === 0 || newHigh >= lastPrice + 0.01;
    // Edits are unthrottled (live, spam-free). A *fresh* re-post — used only
    // when there is no editable message yet (first alert still in flight, the
    // prior message is too old to edit, or message tracking is unavailable) —
    // keeps a 5-min cooldown so the channel is never flooded with new cards.
    const sendAllowed = canEdit || lastPrice === 0 || minsSinceLast >= 5;

    if (meetsGain && isNewPeak && newHigh > 0 && sendAllowed) {
      console.log(
        `🚀 [alerts] PEAK — trade ${trade.id}: $${newHigh.toFixed(4)} ` +
        `(+${(gainPct * 100).toFixed(1)}%) ${canEdit ? "→ edit in place" : "→ fresh alert"}`
      );
      results.alertsSent++;

      await supabase.from("index_trade_updates").insert({
        trade_id:    trade.id,
        update_type: "new_high",
        title:       `New High: $${newHigh.toFixed(4)}`,
        body:        `New high! $${newHigh.toFixed(4)} (+${(gainPct * 100).toFixed(1)}% from entry)`,
        changes:     { type: "new_high", price: newHigh, gain_pct: gainPct },
      });

      // Record BEFORE queuing — prevents duplicate alerts on crash/retry
      await supabase
        .from("index_trades")
        .update({
          last_peak_alert_price: newHigh,
          last_peak_alert_at:    new Date().toISOString(),
        })
        .eq("id", trade.id);

      const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
      if (channelId && trade.telegram_send_enabled !== false) {
        // Edits re-render the image natively in the outbox processor, so we
        // only regenerate the stored platform snapshot for fresh alerts.
        const snapshotUrl = canEdit
          ? null
          : await tryGenerateSnapshot(supabase, supabaseUrl, supabaseKey, trade.id, true, appBaseUrl);
        await queueTelegramMessage(supabase, "new_high", trade.id, channelId, {
          tradeId:       trade.id,
          highPrice:     newHigh,
          snapshotUrl,
          editMessageId: canEdit ? editMessageId : undefined,
          editChatId:    canEdit ? editChatId    : undefined,
        });
      }
    }
  }
}

// ── EXPIRY ────────────────────────────────────────────────────────────────────

async function handleTradeExpiration(
  supabase: any,
  trade: any,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const { data: finalizationResult, error } = await supabase.rpc(
    "finalize_trade_canonical",
    { p_trade_id: trade.id }
  );

  if (error) {
    console.error(`Failed to finalize expired trade ${trade.id}:`, error);
    return;
  }

  await supabase
    .from("index_trades")
    .update({
      status:                "expired",
      closed_at:             new Date().toISOString(),
      closure_reason:        "EXPIRED",
      data_freshness_status: "stale",
    })
    .eq("id", trade.id);

  await supabase.from("index_trade_updates").insert({
    trade_id:    trade.id,
    update_type: "expired",
    title:       "Trade Expired",
    body:        `Trade expired. Final P/L: $${finalizationResult.final_pnl.toFixed(2)} (${finalizationResult.outcome.toUpperCase()})`,
    changes: {
      type:      "expired",
      final_pnl: finalizationResult.final_pnl,
      outcome:   finalizationResult.outcome,
    },
  });

  const channelId = trade.telegram_channel_id ?? trade.analysis?.telegram_channel_id;
  if (channelId && trade.telegram_send_enabled !== false) {
    await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
      tradeId:   trade.id,
      outcome:   finalizationResult.outcome,
      pnl:       finalizationResult.final_pnl,
      condition: "Expired",
    });
  }

  console.log(`⏰ Trade ${trade.id} expired. P/L: $${finalizationResult.final_pnl.toFixed(2)}`);
}

// ── POLYGON REST ──────────────────────────────────────────────────────────────

async function fetchPolygonSnapshot(
  ticker: string,
  apiKey: string
): Promise<{ bid: number; ask: number; mid: number | null; last: number } | null> {
  try {
    const cleanTicker = ticker.startsWith("O:") ? ticker : `O:${ticker}`;

    const snapshotUrl =
      `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(cleanTicker)}` +
      `?apiKey=${apiKey}`;
    const res = await fetch(snapshotUrl);

    if (res.ok) {
      const data = await res.json();
      if (data.status === "OK" && data.results) {
        const lq   = data.results.last_quote ?? {};
        const bid  = Number(lq.bid ?? 0);
        const ask  = Number(lq.ask ?? 0);
        const last = Number(lq.last_price ?? 0);
        if (bid > 0 || ask > 0 || last > 0) {
          const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null;
          return { bid, ask, mid, last };
        }
      }
    }

    // v3 quotes fallback
    const quotesUrl =
      `https://api.polygon.io/v3/quotes/${encodeURIComponent(cleanTicker)}` +
      `?limit=1&order=desc&sort=timestamp&apiKey=${apiKey}`;
    const qRes = await fetch(quotesUrl);
    if (qRes.ok) {
      const qData = await qRes.json();
      if (qData.status === "OK" && qData.results?.length > 0) {
        const q   = qData.results[0];
        const bid = Number(q.bid_price ?? 0);
        const ask = Number(q.ask_price ?? 0);
        const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null;
        return { bid, ask, mid, last: 0 };
      }
    }
  } catch (err: any) {
    console.error(`Error fetching Polygon snapshot for ${ticker}:`, err.message);
  }
  return null;
}

// ── UNDERLYING INDEX PRICE UPDATE ────────────────────────────────────────────

async function updateUnderlyingPrice(
  supabase: any,
  trade: any,
  apiKey: string
): Promise<void> {
  try {
    const ticker = trade.polygon_underlying_index_ticker.startsWith("I:")
      ? trade.polygon_underlying_index_ticker
      : `I:${trade.polygon_underlying_index_ticker}`;

    const url = `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=${encodeURIComponent(ticker)}&apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️  Underlying price fetch failed for ${ticker}: HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.length) {
      console.warn(`⚠️  No underlying snapshot data for ${ticker}`);
      return;
    }

    const result = data.results[0];
    const price: number = result.value ?? result.session?.close ?? 0;
    if (!price || price <= 0) return;

    const currentHigh = trade.underlying_high_since ?? price;
    const currentLow  = trade.underlying_low_since  ?? price;

    await supabase
      .from("index_trades")
      .update({
        current_underlying:    price,
        underlying_high_since: Math.max(currentHigh, price),
        underlying_low_since:  Math.min(currentLow,  price),
      })
      .eq("id", trade.id);

    console.log(`📈 Underlying ${ticker}: $${price.toFixed(2)} (high=${Math.max(currentHigh, price).toFixed(2)}, low=${Math.min(currentLow, price).toFixed(2)})`);
  } catch (err: any) {
    console.warn(`⚠️  updateUnderlyingPrice error for trade ${trade.id}: ${err.message}`);
  }
}

async function tryGenerateSnapshot(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  tradeId: string,
  isNewHigh: boolean,
  appBaseUrl: string
): Promise<string | null> {
  if (!appBaseUrl) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ tradeId, isNewHigh, appBaseUrl }),
    });
    if (res.ok) {
      const r = await res.json();
      if (r.imageUrl) {
        await supabase
          .from("index_trades")
          .update({ contract_url: r.imageUrl })
          .eq("id", tradeId);
        return r.imageUrl;
      }
    }
  } catch (err: any) {
    console.warn(`Snapshot generation failed for trade ${tradeId}:`, err.message);
  }
  return null;
}

async function queueTelegramMessage(
  supabase: any,
  messageType: string,
  tradeId: string,
  channelId: string,
  payload: any
): Promise<void> {
  try {
    const { data: fullTrade } = await supabase
      .from("index_trades")
      .select(`
        *,
        current_contract_snapshot,
        author:profiles!author_id(id, full_name, avatar_url),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq("id", tradeId)
      .single();

    if (!fullTrade) return;
    if (payload.snapshotUrl) fullTrade.contract_url = payload.snapshotUrl;

    let actualChannelId = channelId;
    if (/^[0-9a-f-]{36}$/i.test(channelId)) {
      const { data: ch } = await supabase
        .from("telegram_channels")
        .select("channel_id")
        .eq("id", channelId)
        .single();
      if (ch?.channel_id) actualChannelId = ch.channel_id;
    }

    await supabase.from("telegram_outbox").insert({
      message_type:  messageType,
      payload:       { ...payload, trade: fullTrade },
      channel_id:    actualChannelId,
      status:        "pending",
      priority:      5,
      next_retry_at: new Date().toISOString(),
    });

    console.log(`📤 Queued ${messageType} for channel ${actualChannelId}`);
  } catch (err: any) {
    console.error("Error queuing Telegram message:", err.message);
  }
}
