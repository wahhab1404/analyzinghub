import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function isMarketOpen(): boolean {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcDay = now.getUTCDay();

  if (utcDay === 0 || utcDay === 6) return false;

  const marketOpenMinutes = 14 * 60 + 30;
  const marketCloseMinutes = 21 * 60;
  const currentMinutes = utcHours * 60 + utcMinutes;

  return currentMinutes >= marketOpenMinutes && currentMinutes < marketCloseMinutes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔄 [indices-trade-tracker] Starting trade tracking cycle...");

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

    if (!activeTrades || activeTrades.length === 0) {
      console.log("✅ No active trades to track");
      return new Response(
        JSON.stringify({ success: true, message: "No active trades", tracked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Tracking ${activeTrades.length} active trades`);

    const marketIsOpen = isMarketOpen();
    console.log(`📊 Market status: ${marketIsOpen ? 'OPEN' : 'CLOSED'}`);

    const results = {
      tracked: activeTrades.length,
      updated: 0,
      errors: 0,
      newWins: 0,
      expired: 0,
    };

    for (const trade of activeTrades) {
      try {
        console.log(`\n🔍 Processing trade ${trade.id} (${trade.polygon_option_ticker})`);

        if (!trade.polygon_option_ticker) {
          console.log(`⚠️  Skipping trade ${trade.id}: No option ticker`);
          continue;
        }

        if (trade.is_using_manual_price) {
          console.log(`⚠️  Trade ${trade.id} is using manual price override - skipping automatic price updates`);
          results.updated++;
          continue;
        }

        const now = new Date();
        if (trade.expiry) {
          const expiryDate = new Date(trade.expiry + "T21:00:00Z");
          if (now > expiryDate) {
            console.log(`⏰ Trade ${trade.id} expired, finalizing with canonical logic`);
            await handleTradeExpiration(supabase, trade, supabaseUrl, supabaseKey);
            results.expired++;
            continue;
          }
        }

        // Skip price checks after market close
        if (!marketIsOpen) {
          console.log(`⏭️  Market closed - skipping price updates for trade ${trade.id}`);
          continue;
        }

        const lastQuoteAt = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
        const timeSinceLastQuote = lastQuoteAt ? now.getTime() - lastQuoteAt.getTime() : Infinity;
        const shouldCheckPrice = !lastQuoteAt || timeSinceLastQuote > 5000;

        if (!shouldCheckPrice) {
          console.log(`⏭️  Skipping price check (last quote ${Math.floor(timeSinceLastQuote / 1000)}s ago)`);
          continue;
        }

        const quote = await fetchPolygonQuote(trade.polygon_option_ticker, Deno.env.get("POLYGON_API_KEY")!);

        if (!quote) {
          console.log(`⚠️  No quote data for ${trade.polygon_option_ticker}`);
          continue;
        }

        console.log(`💰 Quote for ${trade.polygon_option_ticker}:`, {
          last: quote.last,
          bid: quote.bid,
          ask: quote.ask,
          mid: quote.mid,
        });

        const newContract = quote.mid || quote.last || 0;
        if (newContract === 0) {
          console.log(`⚠️  Invalid contract price for trade ${trade.id}`);
          continue;
        }

        // Update using canonical high watermark function
        const { data: updateResult, error: updateError } = await supabase.rpc(
          'update_trade_high_watermark',
          {
            p_trade_id: trade.id,
            p_current_price: newContract
          }
        );

        if (updateError) {
          console.error(`❌ Failed to update high watermark for trade ${trade.id}:`, updateError);
          results.errors++;
          continue;
        }

        console.log(`✅ High watermark update result:`, updateResult);

        // Update current price and quote snapshot
        await supabase
          .from("index_trades")
          .update({
            current_contract: newContract,
            current_contract_snapshot: quote,
            last_quote_at: new Date().toISOString(),
          })
          .eq("id", trade.id);

        // Resolve app base URL for snapshot generation (pass explicitly so the edge
        // function does not fall back to localhost:3000).
        const appBaseUrl = Deno.env.get("APP_BASE_URL") ||
          Deno.env.get("NEXT_PUBLIC_SITE_URL") ||
          Deno.env.get("NEXT_PUBLIC_APP_URL") ||
          'https://analyzhub.com';

        // ── WINNING TRADE ──────────────────────────────────────────────────
        if (updateResult.newly_won) {
          console.log(`🎉 [tracker] Trade ${trade.id} reached WIN status! max_profit=$${updateResult.max_profit_dollars?.toFixed(2)}`);
          results.newWins++;

          await supabase.from("index_trade_updates").insert({
            trade_id: trade.id,
            update_type: "milestone",
            title: "$100 Profit Milestone",
            body: `🎉 Winning Trade! Max profit reached $${(updateResult.max_profit_dollars ?? 0).toFixed(2)} - صفقة رابحة`,
            changes: {
              type: "winning_trade",
              max_profit: updateResult.max_profit_dollars,
              high_watermark: updateResult.new_high
            },
          });

          // Generate snapshot for the winning alert.
          // Note: the outbox processor will also attempt image generation via generate-image
          // bytes API — this pre-generation just caches the URL on the trade record.
          let winningSnapshotUrl = null;
          if (appBaseUrl) {
            try {
              console.log(`[tracker] Generating winning snapshot for trade ${trade.id}...`);
              const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  tradeId: trade.id,
                  isNewHigh: false,
                  appBaseUrl,
                }),
              });

              if (snapshotResponse.ok) {
                const snapshotResult = await snapshotResponse.json();
                winningSnapshotUrl = snapshotResult.imageUrl;
                console.log(`[tracker] ✅ Winning snapshot generated: ${winningSnapshotUrl}`);
                await supabase
                  .from("index_trades")
                  .update({ contract_url: winningSnapshotUrl })
                  .eq("id", trade.id);
              } else {
                const errBody = await snapshotResponse.text().catch(() => '');
                console.warn(`[tracker] Winning snapshot generation failed (${snapshotResponse.status}): ${errBody.substring(0, 200)}`);
              }
            } catch (snapshotError: any) {
              console.error('[tracker] Exception generating winning snapshot:', snapshotError?.message);
            }
          } else {
            console.warn('[tracker] APP_BASE_URL not set — skipping pre-generation snapshot; outbox will handle image');
          }

          const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
          console.log(`[tracker] Winning trade channel resolved: ${channelId ?? 'NONE'}, send_enabled: ${trade.telegram_send_enabled}`);
          if (channelId && trade.telegram_send_enabled !== false) {
            await queueTelegramMessage(supabase, "winning_trade", trade.id, channelId, {
              tradeId: trade.id,
              max_profit: updateResult.max_profit_dollars,
              high_watermark: updateResult.new_high,
              snapshotUrl: winningSnapshotUrl,
            });
          } else {
            console.warn(`[tracker] Skipping winning_trade Telegram queue — channelId: ${channelId}, send_enabled: ${trade.telegram_send_enabled}`);
          }
        }

        // ── PEAK / NEW HIGH ────────────────────────────────────────────────
        // Only queue a Telegram alert when BOTH of these pass:
        //   1. Gain gate  — new high must be ≥ 10 % above the entry price
        //   2. Dedup gate — new high must be ≥ 20 % higher than the last
        //                   alerted peak AND at least 5 minutes elapsed
        // This prevents flooding the channel on every price tick.
        if (updateResult.is_new_high && !updateResult.newly_won) {
          const newHigh = updateResult.new_high as number;
          const entryPrice: number = parseFloat(
            trade.entry_contract_snapshot?.mid ??
            trade.entry_contract_snapshot?.last ??
            trade.entry_contract_snapshot?.price ??
            0
          ) || 0;

          // Gate 1: minimum gain from entry (avoid trivial noise)
          const gainPct = entryPrice > 0 ? (newHigh - entryPrice) / entryPrice : 0;
          const MIN_GAIN_PCT = 0.10; // 10 % gain from entry before any peak alert fires

          // Gate 2: deduplication relative to last alerted peak
          const lastAlertedPrice: number = parseFloat(trade.last_peak_alert_price ?? 0) || 0;
          const lastAlertedAt: Date | null = trade.last_peak_alert_at
            ? new Date(trade.last_peak_alert_at)
            : null;
          const minutesSinceLastAlert = lastAlertedAt
            ? (now.getTime() - lastAlertedAt.getTime()) / 60_000
            : Infinity;
          const IMPROVEMENT_PCT = 0.20; // new high must be 20 % above the last alerted price
          const MIN_COOLDOWN_MIN = 5;   // at least 5 minutes between peak alerts

          const meetsGainGate = gainPct >= MIN_GAIN_PCT;
          const meetsImprovementGate =
            lastAlertedPrice === 0 ||
            newHigh >= lastAlertedPrice * (1 + IMPROVEMENT_PCT);
          const meetsCooldownGate = minutesSinceLastAlert >= MIN_COOLDOWN_MIN;

          console.log(`[tracker] Peak check trade ${trade.id}:`, {
            newHigh,
            entryPrice,
            gainPct: `${(gainPct * 100).toFixed(1)}%`,
            lastAlertedPrice,
            minutesSinceLastAlert: minutesSinceLastAlert === Infinity ? 'never' : minutesSinceLastAlert.toFixed(1),
            meetsGainGate,
            meetsImprovementGate,
            meetsCooldownGate,
          });

          if (!meetsGainGate) {
            console.log(`[tracker] ⏭️  Peak alert SKIPPED — gain ${(gainPct*100).toFixed(1)}% < ${MIN_GAIN_PCT*100}% minimum for trade ${trade.id}`);
          } else if (!meetsImprovementGate) {
            console.log(`[tracker] ⏭️  Peak alert SKIPPED — improvement ${((newHigh/lastAlertedPrice-1)*100).toFixed(1)}% < ${IMPROVEMENT_PCT*100}% threshold for trade ${trade.id}`);
          } else if (!meetsCooldownGate) {
            console.log(`[tracker] ⏭️  Peak alert SKIPPED — only ${minutesSinceLastAlert.toFixed(1)} min since last alert (min ${MIN_COOLDOWN_MIN} min) for trade ${trade.id}`);
          } else {
            // All gates passed — record this high and send the alert
            console.log(`🚀 [tracker] NEW HIGH ALERT qualifying for trade ${trade.id}: $${newHigh.toFixed(4)} (+${(gainPct*100).toFixed(1)}% from entry)`);

            await supabase.from("index_trade_updates").insert({
              trade_id: trade.id,
              update_type: "new_high",
              title: `New High: $${newHigh.toFixed(4)}`,
              body: `New high! Contract price reached $${newHigh.toFixed(4)} (+${(gainPct*100).toFixed(1)}% from entry)`,
              changes: { type: "new_high", price: newHigh, gain_pct: gainPct },
            });

            // Persist alert state BEFORE queuing so a crash doesn't cause duplicate
            await supabase
              .from("index_trades")
              .update({
                last_peak_alert_price: newHigh,
                last_peak_alert_at: now.toISOString(),
              })
              .eq("id", trade.id);

            // Attempt to pre-generate snapshot (best-effort)
            let snapshotUrl: string | null = null;
            if (appBaseUrl) {
              try {
                console.log(`[tracker] Generating peak snapshot for trade ${trade.id}...`);
                const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    tradeId: trade.id,
                    isNewHigh: true,
                    newHighPrice: newHigh,
                    appBaseUrl,
                  }),
                });

                if (snapshotResponse.ok) {
                  const snapshotResult = await snapshotResponse.json();
                  snapshotUrl = snapshotResult.imageUrl;
                  console.log(`[tracker] ✅ Peak snapshot generated: ${snapshotUrl}`);
                  await supabase
                    .from("index_trades")
                    .update({ contract_url: snapshotUrl })
                    .eq("id", trade.id);
                } else {
                  const errBody = await snapshotResponse.text().catch(() => '');
                  console.warn(`[tracker] Peak snapshot generation failed (${snapshotResponse.status}): ${errBody.substring(0, 200)}`);
                  console.warn('[tracker] Outbox processor will retry image generation via generate-image API');
                }
              } catch (snapshotError: any) {
                console.error('[tracker] Exception generating peak snapshot:', snapshotError?.message);
                console.warn('[tracker] Outbox processor will generate image at send time');
              }
            } else {
              console.warn('[tracker] APP_BASE_URL not set — outbox processor will generate peak image at send time');
            }

            const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
            console.log(`[tracker] Peak alert channel resolved: ${channelId ?? 'NONE'}, send_enabled: ${trade.telegram_send_enabled}`);
            if (channelId && trade.telegram_send_enabled !== false) {
              await queueTelegramMessage(supabase, "new_high", trade.id, channelId, {
                tradeId: trade.id,
                highPrice: newHigh,
                snapshotUrl,
              });
              console.log(`[tracker] ✅ Peak alert queued for channel ${channelId}`);
            } else {
              console.warn(`[tracker] Skipping new_high Telegram queue — channelId: ${channelId}, send_enabled: ${trade.telegram_send_enabled}`);
            }
          }
        }

        results.updated++;
      } catch (tradeError) {
        console.error(`❌ Error processing trade ${trade.id}:`, tradeError);
        results.errors++;
      }
    }

    console.log("\n✅ [indices-trade-tracker] Completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ [indices-trade-tracker] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleTradeExpiration(supabase: any, trade: any, supabaseUrl: string, supabaseKey: string) {
  // Use canonical finalization
  const { data: finalizationResult, error: finalizationError } = await supabase.rpc(
    'finalize_trade_canonical',
    {
      p_trade_id: trade.id
    }
  );

  if (finalizationError) {
    console.error(`Failed to finalize expired trade ${trade.id}:`, finalizationError);
    return;
  }

  console.log(`✅ Finalized expired trade ${trade.id}:`, finalizationResult);

  // Mark as expired
  const { error: updateError } = await supabase
    .from("index_trades")
    .update({
      status: "expired",
      closed_at: new Date().toISOString(),
      closure_reason: "EXPIRED",
    })
    .eq("id", trade.id);

  if (updateError) {
    console.error(`Failed to mark trade ${trade.id} as expired:`, updateError);
    return;
  }

  await supabase.from("index_trade_updates").insert({
    trade_id: trade.id,
    update_type: "expired",
    title: "Trade Expired",
    body: `Trade expired with final P/L: $${finalizationResult.final_pnl.toFixed(2)} (${finalizationResult.outcome.toUpperCase()})`,
    changes: {
      type: "expired",
      final_pnl: finalizationResult.final_pnl,
      outcome: finalizationResult.outcome
    },
  });

  const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
  if (channelId && trade.telegram_send_enabled !== false) {
    await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
      tradeId: trade.id,
      outcome: finalizationResult.outcome,
      pnl: finalizationResult.final_pnl,
      condition: "Expired",
    });
  }

  console.log(`⏰ Trade ${trade.id} marked as expired with P/L: $${finalizationResult.final_pnl.toFixed(2)}`);
}

async function queueTelegramMessage(
  supabase: any,
  messageType: string,
  tradeId: string,
  channelId: string,
  payload: any
) {
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

    if (!fullTrade) {
      console.error(`Trade ${tradeId} not found for telegram queue`);
      return;
    }

    if (payload.snapshotUrl) {
      fullTrade.contract_url = payload.snapshotUrl;
    }

    let actualChannelId = channelId;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId)) {
      const { data: channel } = await supabase
        .from("telegram_channels")
        .select("channel_id")
        .eq("id", channelId)
        .single();

      if (channel?.channel_id) {
        actualChannelId = channel.channel_id;
      }
    }

    await supabase.from("telegram_outbox").insert({
      message_type: messageType,
      payload: { ...payload, trade: fullTrade },
      channel_id: actualChannelId,
      status: "pending",
      priority: 5,
      next_retry_at: new Date().toISOString(),
    });

    console.log(`📤 Queued ${messageType} message for channel ${actualChannelId}`);
  } catch (error) {
    console.error("Error queuing telegram message:", error);
  }
}

async function fetchPolygonQuote(ticker: string, apiKey: string) {
  try {
    const isOption = ticker.startsWith('O:');
    const cleanTicker = isOption ? ticker : `O:${ticker}`;

    const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(cleanTicker)}?apiKey=${apiKey}`;
    console.log(`📡 Trying snapshot endpoint: ${snapshotUrl}`);

    const snapshotResponse = await fetch(snapshotUrl);

    if (snapshotResponse.ok) {
      const snapshotData = await snapshotResponse.json();

      if (snapshotData.status === 'OK' && snapshotData.results && !Array.isArray(snapshotData.results)) {
        const result = snapshotData.results;
        const lastQuote = result.last_quote || {};

        if (lastQuote.bid || lastQuote.ask || lastQuote.last_price) {
          console.log(`✅ Got snapshot data: bid=${lastQuote.bid}, ask=${lastQuote.ask}`);
          return {
            last: lastQuote.last_price || 0,
            bid: lastQuote.bid || 0,
            ask: lastQuote.ask || 0,
            mid: lastQuote.bid && lastQuote.ask ? (lastQuote.bid + lastQuote.ask) / 2 : lastQuote.last_price || 0,
            volume: result.day?.volume || 0,
            timestamp: lastQuote.timeframe,
          };
        }
      }
    }

    console.log(`⚠️ Snapshot empty, trying quotes endpoint...`);

    const quotesUrl = `https://api.polygon.io/v3/quotes/${encodeURIComponent(cleanTicker)}?limit=1&order=desc&sort=timestamp&apiKey=${apiKey}`;
    console.log(`📡 Fetching from quotes endpoint: ${quotesUrl}`);

    const quotesResponse = await fetch(quotesUrl);

    if (!quotesResponse.ok) {
      const errorText = await quotesResponse.text();
      console.error(`Polygon quotes API error (${quotesResponse.status}):`, errorText);
      return null;
    }

    const quotesData = await quotesResponse.json();

    if (quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {
      const quote = quotesData.results[0];
      const mid = quote.bid_price && quote.ask_price ? (quote.bid_price + quote.ask_price) / 2 : 0;

      console.log(`✅ Got quotes data: bid=${quote.bid_price}, ask=${quote.ask_price}, mid=${mid.toFixed(4)}`);

      return {
        last: 0,
        bid: quote.bid_price || 0,
        ask: quote.ask_price || 0,
        mid: mid,
        volume: 0,
        timestamp: quote.sip_timestamp,
      };
    }

    console.log('❌ No quote data available from either endpoint');
    return null;
  } catch (error) {
    console.error('Error fetching Polygon quote:', error);
    return null;
  }
}
