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
      newHighs: 0,
      targets: 0,
      stoploss: 0,
      expired: 0,
      successDetected: 0,
      afterCloseWins: 0,
    };

    for (const trade of activeTrades) {
      try {
        console.log(`\n🔍 Processing trade ${trade.id} (${trade.polygon_option_ticker})`);

        if (!trade.polygon_option_ticker) {
          console.log(`⚠️  Skipping trade ${trade.id}: No option ticker`);
          continue;
        }

        const now = new Date();
        if (trade.expiry) {
          const expiryDate = new Date(trade.expiry + "T21:00:00Z");
          if (now > expiryDate) {
            console.log(`⏰ Trade ${trade.id} expired, marking as such`);
            await handleTradeExpiration(supabase, trade, supabaseUrl, supabaseKey);
            results.expired++;
            continue;
          }
        }

        // After market close, check if trade gain > $99 and hasn't been announced as winning
        if (!marketIsOpen) {
          const contractHigh = trade.contract_high_since || 0;
          const entryContractSnapshot = trade.entry_contract_snapshot || {};
          const entryContractPrice = entryContractSnapshot.mid || entryContractSnapshot.last || 0;

          if (entryContractPrice > 0) {
            const gainFromEntry = contractHigh - entryContractPrice;

            if (gainFromEntry > 99 && !trade.win_100_announced) {
              console.log(`🎉 After-market winning trade detected! Trade ${trade.id} - Gain: $${gainFromEntry.toFixed(2)} (High: $${contractHigh.toFixed(2)}, Entry: $${entryContractPrice.toFixed(2)})`);

              const currentPrice = trade.current_contract || contractHigh;
              const netPnl = (contractHigh - entryContractPrice) * (trade.qty || 1);

            await supabase
              .from("index_trades")
              .update({ win_100_announced: true })
              .eq("id", trade.id);

              await supabase.from("index_trade_updates").insert({
                trade_id: trade.id,
                update_type: "milestone",
                title: "$99+ Profit Reached (After Hours)",
                body: `🎉 Winning Trade! Profit: $${gainFromEntry.toFixed(2)} (High: $${contractHigh.toFixed(2)}, Entry: $${entryContractPrice.toFixed(2)}) - صفقة رابحة`,
                changes: { type: "winning_trade_after_close", gain: gainFromEntry, high: contractHigh, entry: entryContractPrice },
              });

              let winningSnapshotUrl = null;
              try {
                const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    tradeId: trade.id,
                    isNewHigh: false,
                  }),
                });

                if (snapshotResponse.ok) {
                  const snapshotResult = await snapshotResponse.json();
                  winningSnapshotUrl = snapshotResult.imageUrl;
                  console.log(`Snapshot generated for after-close winning trade: ${winningSnapshotUrl}`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                }
              } catch (snapshotError) {
                console.error('Failed to generate snapshot for after-close winning trade:', snapshotError);
              }

              const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
              if (channelId && trade.telegram_send_enabled !== false) {
                await queueTelegramMessage(supabase, "winning_trade", trade.id, channelId, {
                  tradeId: trade.id,
                  pnl: netPnl,
                  entryPrice: entryContractPrice,
                  currentPrice: contractHigh,
                  highPrice: contractHigh,
                  gain: gainFromEntry,
                  snapshotUrl: winningSnapshotUrl,
                  afterClose: true,
                });
              }

              results.afterCloseWins++;
            }
          }
        }

        const lastQuoteAt = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
        const timeSinceLastQuote = lastQuoteAt ? now.getTime() - lastQuoteAt.getTime() : Infinity;
        const shouldCheckPrice = marketIsOpen && (!lastQuoteAt || timeSinceLastQuote > 55000);

        if (!shouldCheckPrice) {
          if (!marketIsOpen) {
            console.log(`⏭️  Skipping price check (market closed)`);
          } else {
            console.log(`⏭️  Skipping price check (last quote ${Math.floor(timeSinceLastQuote / 1000)}s ago)`);
          }
          continue;
        }

        const quote = await fetchPolygonQuote(trade.polygon_option_ticker, Deno.env.get("POLYGON_API_KEY")!);

        if (!quote) {
          console.log(`❌ No quote data for ${trade.polygon_option_ticker}`);
          results.errors++;
          continue;
        }

        console.log(`💰 Quote for ${trade.polygon_option_ticker}:`, {
          last: quote.last,
          bid: quote.bid,
          ask: quote.ask,
          mid: quote.mid,
        });

        const entryContractSnapshot = trade.entry_contract_snapshot || {};
        const entryContractPrice = entryContractSnapshot.mid || entryContractSnapshot.last || 0;

        if (entryContractPrice === 0) {
          console.log(`⚠️  Trade ${trade.id} has no valid entry price, skipping`);
          continue;
        }

        const newContract = quote.mid || quote.last || 0;
        const updates: any = {
          current_contract: newContract,
          current_contract_snapshot: quote,
          last_quote_at: new Date().toISOString(),
        };

        let newContractHigh = trade.contract_high_since || entryContractPrice;
        let newContractLow = trade.contract_low_since || entryContractPrice;
        let statusChanged = false;
        let newStatus = trade.status;

        if (newContract > newContractHigh) {
          newContractHigh = newContract;
          updates.contract_high_since = newContractHigh;
        }

        if (newContract < newContractLow) {
          newContractLow = newContract;
          updates.contract_low_since = newContractLow;
        }

        const netPnl = (newContract - entryContractPrice) * (trade.qty || 1);
        const percentGain = ((newContractHigh - entryContractPrice) / entryContractPrice) * 100;

        const prevHighPercent = trade.contract_high_since
          ? ((trade.contract_high_since - entryContractPrice) / entryContractPrice) * 100
          : 0;

        const gainThreshold = 5;
        const isSignificantNewHigh = percentGain >= gainThreshold && percentGain > prevHighPercent + 2;

        if (isSignificantNewHigh) {
          if (!trade.win_100_announced && netPnl >= 100) {
            console.log(`🎉 Trade ${trade.id} reached $100+ profit milestone!`);
            updates.win_100_announced = true;

            await supabase.from("index_trade_updates").insert({
              trade_id: trade.id,
              update_type: "milestone",
              title: "$100 Profit Milestone",
              body: `🎉 Winning Trade! Net profit reached $${netPnl.toFixed(2)} (Entry: $${entryContractPrice.toFixed(2)}, Current: $${newContract.toFixed(2)}) - صفقة رابحة`,
              changes: { type: "winning_trade", pnl_usd: netPnl, entry: entryContractPrice, current: newContract },
            });

            let winningSnapshotUrl = null;
            try {
              const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  tradeId: trade.id,
                  isNewHigh: false,
                }),
              });

              if (snapshotResponse.ok) {
                const snapshotResult = await snapshotResponse.json();
                winningSnapshotUrl = snapshotResult.imageUrl;
                console.log(`Snapshot generated for winning trade: ${winningSnapshotUrl}`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (snapshotError) {
              console.error('Failed to generate snapshot for winning trade:', snapshotError);
            }

            const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
            if (channelId && trade.telegram_send_enabled !== false) {
              await queueTelegramMessage(supabase, "winning_trade", trade.id, channelId, {
                tradeId: trade.id,
                pnl: netPnl,
                entryPrice: entryContractPrice,
                currentPrice: newContract,
                snapshotUrl: winningSnapshotUrl,
              });
            }

            results.successDetected++;
          }
        }

        const oldContractHigh = trade.contract_high_since || entryContractPrice;
        const isNewHigh = newContractHigh > oldContractHigh;

        if (isNewHigh && isSignificantNewHigh) {
          console.log(`🚀 NEW HIGH for trade ${trade.id}: ${newContractHigh.toFixed(4)} (+${percentGain.toFixed(2)}%)`);
          results.newHighs++;

          await supabase.from("index_trade_updates").insert({
            trade_id: trade.id,
            update_type: "new_high",
            title: `New High: $${newContractHigh.toFixed(4)}`,
            body: `New high! Contract price reached $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            changes: { type: "new_high", price: newContractHigh, gain_percent: percentGain },
          });

          let snapshotUrl = null;
          try {
            const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                tradeId: trade.id,
                isNewHigh: true,
                newHighPrice: newContractHigh,
              }),
            });

            if (snapshotResponse.ok) {
              const snapshotResult = await snapshotResponse.json();
              snapshotUrl = snapshotResult.imageUrl;
              console.log(`Snapshot generated for new high: ${snapshotUrl}`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (snapshotError) {
            console.error('Failed to generate snapshot for new high:', snapshotError);
          }

          const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
          if (channelId && trade.telegram_send_enabled !== false) {
            await queueTelegramMessage(supabase, "new_high", trade.id, channelId, {
              tradeId: trade.id,
              highPrice: newContractHigh,
              gainPercent: percentGain,
              snapshotUrl,
            });
          }
        }

        if (statusChanged) {
          updates.status = newStatus;

          let outcome = "stopped";
          let condition = "";

          if (newStatus === "tp_hit") {
            outcome = "succeed";
            condition = "Target reached";
          } else if (newStatus === "sl_hit") {
            outcome = "loss";
            condition = "Stop loss hit";
          }

          updates.outcome = outcome;

          await supabase.from("index_trade_updates").insert({
            trade_id: trade.id,
            update_type: newStatus,
            title: condition,
            body: condition,
            changes: { type: newStatus, outcome, pnl_usd: netPnl },
          });

          let resultSnapshotUrl = null;
          try {
            const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                tradeId: trade.id,
                isNewHigh: false,
              }),
            });

            if (snapshotResponse.ok) {
              const snapshotResult = await snapshotResponse.json();
              resultSnapshotUrl = snapshotResult.imageUrl;
              console.log(`Snapshot generated for trade result: ${resultSnapshotUrl}`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (snapshotError) {
            console.error('Failed to generate snapshot for trade result:', snapshotError);
          }

          const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
          if (channelId && trade.telegram_send_enabled !== false) {
            await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
              tradeId: trade.id,
              outcome,
              pnl: netPnl,
              condition,
              snapshotUrl: resultSnapshotUrl,
            });
          }
        }

        const { error: updateError } = await supabase
          .from("index_trades")
          .update(updates)
          .eq("id", trade.id);

        if (updateError) {
          console.error(`❌ Failed to update trade ${trade.id}:`, updateError);
          results.errors++;
        } else {
          console.log(`✅ Updated trade ${trade.id}`);
          results.updated++;
        }
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
  const entryContractSnapshot = trade.entry_contract_snapshot || {};
  const entryContractPrice = entryContractSnapshot.mid || entryContractSnapshot.last || 0;
  const currentPrice = trade.current_contract || entryContractPrice;
  const netPnl = (currentPrice - entryContractPrice) * (trade.qty || 1);

  const updates: any = {
    status: "expired",
    outcome: "expired",
    pnl_usd: netPnl,
  };

  const { error: updateError } = await supabase
    .from("index_trades")
    .update(updates)
    .eq("id", trade.id);

  if (updateError) {
    console.error(`Failed to mark trade ${trade.id} as expired:`, updateError);
  } else {
    await supabase.from("index_trade_updates").insert({
      trade_id: trade.id,
      update_type: "expired",
      title: "Trade Expired",
      body: `Trade expired at contract price $${currentPrice.toFixed(2)} with P/L: $${netPnl.toFixed(2)}`,
      changes: { type: "expired", pnl_usd: netPnl },
    });

    const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
    if (channelId && trade.telegram_send_enabled !== false) {
      await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
        tradeId: trade.id,
        outcome: updates.outcome,
        pnl: netPnl,
        condition: "Expired",
      });
    }
  }

  console.log(`⏰ Trade ${trade.id} marked as expired with P/L: $${netPnl.toFixed(2)}`);
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

    console.log(`📤 Queued ${messageType} message for channel ${actualChannelId} with contract_url: ${fullTrade.contract_url || 'none'}`);
  } catch (error) {
    console.error("Error queuing telegram message:", error);
  }
}

async function fetchPolygonQuote(ticker: string, apiKey: string) {
  try {
    const isOption = ticker.startsWith('O:');
    const cleanTicker = isOption ? ticker : `O:${ticker}`;
    const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(cleanTicker)}?apiKey=${apiKey}`;

    console.log(`📡 Fetching quote from Polygon: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Polygon API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results) {
      const result = data.results;

      // Check if results is an array (empty results for expired contracts)
      if (Array.isArray(result) && result.length === 0) {
        console.log(`⚠️ Empty results array for ${ticker} - likely expired or no data available`);
        return null;
      }

      const lastQuote = result.last_quote || {};
      const details = result.details || {};

      return {
        last: lastQuote.last_price || 0,
        bid: lastQuote.bid || 0,
        ask: lastQuote.ask || 0,
        mid: lastQuote.bid && lastQuote.ask ? (lastQuote.bid + lastQuote.ask) / 2 : lastQuote.last_price || 0,
        volume: result.day?.volume || 0,
        timestamp: lastQuote.timeframe,
      };
    }

    console.log('No results from Polygon API');
    return null;
  } catch (error) {
    console.error('Error fetching Polygon quote:', error);
    return null;
  }
}
