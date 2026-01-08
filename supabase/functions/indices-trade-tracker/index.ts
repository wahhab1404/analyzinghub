import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUCCESS_THRESHOLD_USD = 100;

function isMarketOpen(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayOfWeek = etTime.getDay();
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const isRTH = isMarketOpen();
  console.log(`[indices-trade-tracker] Starting price update cycle (RTH: ${isRTH})`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    if (!polygonApiKey) {
      throw new Error("POLYGON_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: trades, error: tradesError } = await supabase
      .from("index_trades")
      .select(`
        id,
        author_id,
        polygon_option_ticker,
        polygon_underlying_index_ticker,
        trade_price_basis,
        direction,
        entry_contract_snapshot,
        entry_underlying_snapshot,
        current_contract,
        current_underlying,
        current_contract_snapshot,
        contract_high_since,
        contract_low_since,
        underlying_high_since,
        underlying_low_since,
        manual_contract_price,
        manual_contract_high,
        manual_contract_low,
        is_using_manual_price,
        last_rth_tracking_at,
        targets,
        stoploss,
        qty,
        contract_multiplier,
        expiry_datetime,
        last_quote_at,
        telegram_channel_id,
        telegram_send_enabled,
        analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)
      `)
      .eq("status", "active")
      .order("last_quote_at", { ascending: true, nullsFirst: true })
      .limit(50);

    if (tradesError) {
      console.error("Error fetching trades:", tradesError);
      throw tradesError;
    }

    if (!trades || trades.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No active trades", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${trades.length} active trades`);

    const results = {
      processed: 0,
      updated: 0,
      successDetected: 0,
      targetDetected: 0,
      stopDetected: 0,
      expiredDetected: 0,
      errors: 0,
    };

    const now = new Date();

    for (const trade of trades as any[]) {
      try {
        if (trade.expiry_datetime) {
          const expiryDate = new Date(trade.expiry_datetime);
          const expiryWithBuffer = new Date(expiryDate.getTime() + (15 * 60 * 1000));

          if (now >= expiryWithBuffer) {
            console.log(`Trade ${trade.id} has expired (expiry: ${expiryDate.toISOString()})`);
            await handleExpiredTrade(supabase, trade, supabaseUrl, supabaseKey);
            results.expiredDetected++;
            results.updated++;
            results.processed++;
            continue;
          }
        }

        let newUnderlying = trade.current_underlying;
        let newContract = trade.current_contract;
        let contractQuote = null;

        if (isRTH) {
          const underlyingQuote = await fetchPolygonQuote(
            trade.polygon_underlying_index_ticker,
            polygonApiKey
          );

          if (trade.polygon_option_ticker) {
            contractQuote = await fetchPolygonQuote(
              trade.polygon_option_ticker,
              polygonApiKey
            );
          }

          newUnderlying = underlyingQuote?.price || trade.current_underlying;
          newContract = contractQuote?.price || trade.current_contract;

          if (!newContract || !newUnderlying) {
            console.log(`No price data for trade ${trade.id}, skipping`);
            continue;
          }
        } else {
          if (trade.is_using_manual_price && trade.manual_contract_price) {
            console.log(`Trade ${trade.id} using manual price outside RTH: $${trade.manual_contract_price}`);
            newContract = trade.manual_contract_price;
          }
          if (trade.manual_contract_high) {
            console.log(`Trade ${trade.id} using manual high: $${trade.manual_contract_high}`);
          }
        }

        if (!newContract || !newUnderlying) {
          console.log(`No price data for trade ${trade.id}, skipping`);
          continue;
        }

        const updates: any = {
          current_underlying: newUnderlying,
          current_contract: newContract,
          current_contract_snapshot: contractQuote ? {
            bid: contractQuote.bid,
            ask: contractQuote.ask,
            mid: contractQuote.price,
            last: contractQuote.last,
            volume: contractQuote.volume || 0,
            open_interest: contractQuote.open_interest || 0,
            updated: contractQuote.updated || new Date().toISOString(),
          } : null,
          last_quote_at: new Date().toISOString(),
        };

        if (isRTH) {
          updates.last_rth_tracking_at = new Date().toISOString();
          updates.is_using_manual_price = false;
        }

        const entryUnderlyingPrice = trade.entry_underlying_snapshot?.price || newUnderlying;
        const entryContractPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || newContract;

        let previousContractHigh = trade.contract_high_since || entryContractPrice;
        let previousContractLow = trade.contract_low_since || entryContractPrice;
        const previousUnderlyingHigh = trade.underlying_high_since || entryUnderlyingPrice;
        const previousUnderlyingLow = trade.underlying_low_since || entryUnderlyingPrice;

        if (trade.manual_contract_high && trade.manual_contract_high > previousContractHigh) {
          previousContractHigh = trade.manual_contract_high;
        }
        if (trade.manual_contract_low && trade.manual_contract_low < previousContractLow) {
          previousContractLow = trade.manual_contract_low;
        }

        const newContractHigh = Math.max(previousContractHigh, newContract);
        const isNewHigh = newContractHigh > previousContractHigh;

        updates.underlying_high_since = Math.max(previousUnderlyingHigh, newUnderlying);
        updates.underlying_low_since = Math.min(previousUnderlyingLow, newUnderlying);
        updates.contract_high_since = newContractHigh;
        updates.contract_low_since = Math.min(previousContractLow, newContract);

        const qty = trade.qty || 1;
        const multiplier = trade.contract_multiplier || 100;
        const priceChange = newContract - entryContractPrice;
        const netPnl = priceChange * multiplier * qty;

        let statusChanged = false;
        let newStatus = "active";
        let outcome = null;
        let condition = "";

        if (netPnl >= SUCCESS_THRESHOLD_USD && !statusChanged) {
          newStatus = "closed";
          outcome = "succeed";
          condition = `Success! Net profit reached $${netPnl.toFixed(2)} (Entry: $${entryContractPrice.toFixed(2)}, Current: $${newContract.toFixed(2)})`;
          statusChanged = true;
          results.successDetected++;
          console.log(`✅ Trade ${trade.id} hit $100 success threshold with $${netPnl.toFixed(2)} profit`);
        }

        const target1Price = trade.targets && trade.targets.length > 0 ? trade.targets[0]?.level : null;
        const stopPrice = trade.stoploss?.level;
        const comparePrice = trade.trade_price_basis === "UNDERLYING_PRICE" ? newUnderlying : newContract;

        if (!statusChanged && target1Price) {
          const isCall = trade.direction === "call";
          const targetHit = isCall ? comparePrice >= target1Price : comparePrice <= target1Price;

          if (targetHit) {
            newStatus = "tp_hit";
            outcome = "succeed";
            condition = `Target 1 reached at $${comparePrice.toFixed(4)} (Target: $${target1Price.toFixed(4)})`;
            statusChanged = true;
            results.targetDetected++;
          }
        }

        if (!statusChanged && stopPrice) {
          const isCall = trade.direction === "call";
          const stopHit = isCall ? comparePrice <= stopPrice : comparePrice >= stopPrice;

          if (stopHit) {
            newStatus = "sl_hit";
            outcome = "loss";
            condition = `Stop loss hit at $${comparePrice.toFixed(4)} (Stop: $${stopPrice.toFixed(4)})`;
            statusChanged = true;
            results.stopDetected++;
          }
        }

        if (isNewHigh && !statusChanged) {
          const percentGain = ((newContractHigh - entryContractPrice) / entryContractPrice * 100).toFixed(2);
          console.log(`📈 New high for trade ${trade.id}: $${newContractHigh} (+${percentGain}%)`);

          await supabase.from("trade_updates").insert({
            trade_id: trade.id,
            author_id: trade.author_id,
            body: `New high! Contract price reached $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            changes: { type: "new_high", price: newContractHigh, gain_percent: percentGain },
          });

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
              }),
            });

            if (snapshotResponse.ok) {
              const snapshotResult = await snapshotResponse.json();
              console.log(`Snapshot generated for new high: ${snapshotResult.imageUrl}`);
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
            });
          }
        }

        if (statusChanged) {
          updates.status = newStatus;
          updates.outcome = outcome;
          updates.closed_at = new Date().toISOString();
          updates.pnl_usd = netPnl;

          console.log(`🔄 Trade ${trade.id} status changed to ${newStatus} (${outcome})`);

          await supabase.from("trade_updates").insert({
            trade_id: trade.id,
            author_id: trade.author_id,
            body: condition,
            changes: { type: newStatus, outcome, pnl_usd: netPnl },
          });

          const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
          if (channelId && trade.telegram_send_enabled !== false) {
            await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
              tradeId: trade.id,
              outcome,
              pnl: netPnl,
              condition,
            });
          }
        }

        const { error: updateError } = await supabase
          .from("index_trades")
          .update(updates)
          .eq("id", trade.id);

        if (updateError) {
          console.error(`Error updating trade ${trade.id}:`, updateError);
          results.errors++;
        } else {
          results.updated++;
        }

        results.processed++;
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (tradeError) {
        console.error("Error processing trade:", tradeError);
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Completed in ${duration}ms:`, results);

    return new Response(
      JSON.stringify({ ok: true, duration, ...results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleExpiredTrade(supabase: any, trade: any, supabaseUrl: string, supabaseKey: string) {
  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const currentPrice = trade.current_contract || 0;
  const qty = trade.qty || 1;
  const multiplier = trade.contract_multiplier || 100;

  const pnl = currentPrice > 0 ? (currentPrice - entryPrice) * multiplier * qty : -(entryPrice * multiplier * qty);

  const updates = {
    status: "expired",
    outcome: pnl > 0 ? "succeed" : "expired",
    closed_at: new Date().toISOString(),
    pnl_usd: pnl,
  };

  await supabase.from("index_trades").update(updates).eq("id", trade.id);

  await supabase.from("trade_updates").insert({
    trade_id: trade.id,
    author_id: trade.author_id,
    body: `Trade expired. Final P/L: $${pnl.toFixed(2)}`,
    changes: { type: "expired", pnl_usd: pnl },
  });

  const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
  if (channelId && trade.telegram_send_enabled !== false) {
    await queueTelegramMessage(supabase, "trade_result", trade.id, channelId, {
      tradeId: trade.id,
      outcome: updates.outcome,
      pnl: pnl,
      condition: "Expired",
    });
  }

  console.log(`⏰ Trade ${trade.id} marked as expired with P/L: $${pnl.toFixed(2)}`);
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
    const isIndex = ticker.startsWith('I:');

    let url: string;
    if (isOption) {
      url = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apiKey=${apiKey}`;
    } else if (isIndex) {
      url = `https://api.polygon.io/v3/snapshot?ticker.any_of=${ticker}&apiKey=${apiKey}`;
    } else {
      url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Polygon API error for ${ticker}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (isOption) {
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const quote = data.results[0];
        const mid = (quote.bid_price + quote.ask_price) / 2;

        let volume = 0;
        let open_interest = 0;
        try {
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker.replace('O:', '')}?apiKey=${apiKey}`;
          const snapshotResponse = await fetch(snapshotUrl);
          if (snapshotResponse.ok) {
            const snapshotData = await snapshotResponse.json();
            if (snapshotData.status === "OK" && snapshotData.results) {
              volume = snapshotData.results.day?.volume || 0;
              open_interest = snapshotData.results.open_interest || 0;
            }
          }
        } catch (e) {
          console.warn(`Could not fetch snapshot data for ${ticker}`);
        }

        return {
          ticker: ticker,
          price: mid || quote.bid_price || quote.ask_price,
          bid: quote.bid_price,
          ask: quote.ask_price,
          last: quote.bid_price,
          volume: volume,
          open_interest: open_interest,
          updated: quote.sip_timestamp,
        };
      }
    } else if (isIndex) {
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const snapshot = data.results[0];
        const price = snapshot.value || snapshot.session?.close || snapshot.session?.previous_close;

        if (!price) {
          console.error(`No price found in snapshot for ${ticker}`);
          return null;
        }

        return {
          ticker: ticker,
          price: price,
          bid: price,
          ask: price,
          last: price,
          updated: snapshot.updated || Date.now(),
        };
      }
    } else {
      if (data.status === "OK" && data.ticker) {
        const snapshot = data.ticker;
        const price = snapshot.lastTrade?.p || snapshot.prevDay?.c || null;

        return {
          ticker: snapshot.ticker,
          price,
          bid: snapshot.lastQuote?.P,
          ask: snapshot.lastQuote?.p,
          last: snapshot.lastTrade?.p,
          updated: snapshot.updated,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching Polygon quote for ${ticker}:`, error);
    return null;
  }
}