import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[indices-trade-tracker] Starting price update cycle");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    console.log("[CONFIG CHECK] Polygon API Key present:", !!polygonApiKey);
    console.log("[CONFIG CHECK] Polygon API Key length:", polygonApiKey?.length || 0);

    if (!polygonApiKey) {
      throw new Error("POLYGON_API_KEY not configured in Edge Function secrets");
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
        contract_high_since,
        contract_low_since,
        underlying_high_since,
        underlying_low_since,
        targets,
        stoploss,
        last_quote_at,
        analysis:index_analyses!analysis_id(telegram_channel_id)
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
      winDetected: 0,
      lossDetected: 0,
      errors: 0,
    };

    for (const trade of trades as any[]) {
      try {
        const underlyingQuote = await fetchPolygonQuote(
          trade.polygon_underlying_index_ticker,
          polygonApiKey
        );

        let contractQuote = null;
        if (trade.polygon_option_ticker) {
          contractQuote = await fetchPolygonQuote(
            trade.polygon_option_ticker,
            polygonApiKey
          );
        }

        const newUnderlying = underlyingQuote?.price || trade.current_underlying;
        const newContract = contractQuote?.price || trade.current_contract;

        if (!newContract || !newUnderlying) {
          continue;
        }

        const updates: any = {
          current_underlying: newUnderlying,
          current_contract: newContract,
          last_quote_at: new Date().toISOString(),
        };

        const entryUnderlyingPrice = trade.entry_underlying_snapshot?.price || newUnderlying;
        const entryContractPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || newContract;

        const previousContractHigh = trade.contract_high_since || entryContractPrice;
        const previousContractLow = trade.contract_low_since || entryContractPrice;
        const previousUnderlyingHigh = trade.underlying_high_since || entryUnderlyingPrice;
        const previousUnderlyingLow = trade.underlying_low_since || entryUnderlyingPrice;

        const newContractHigh = Math.max(previousContractHigh, newContract);
        const isNewHigh = newContractHigh > previousContractHigh;

        updates.underlying_high_since = Math.max(previousUnderlyingHigh, newUnderlying);
        updates.underlying_low_since = Math.min(previousUnderlyingLow, newUnderlying);
        updates.contract_high_since = newContractHigh;
        updates.contract_low_since = Math.min(previousContractLow, newContract);

        const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const target1Price = trade.targets && trade.targets.length > 0 ? trade.targets[0]?.level : null;
        const stopPrice = trade.stoploss?.level;

        if (isNewHigh) {
          const percentGain = ((newContractHigh - entryPrice) / entryPrice * 100).toFixed(2);
          console.log(`New high detected for trade ${trade.id}: $${newContractHigh} (+${percentGain}%)`);

          await supabase.from("trade_updates").insert({
            trade_id: trade.id,
            author_id: trade.author_id,
            text_en: `🚀 New high! Contract price reached $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            text_ar: `🚀 قمة جديدة! وصل سعر العقد إلى $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            update_type: "new_high",
          });

          const channelId = trade.analysis?.telegram_channel_id;
          if (channelId) {
            try {
              const { data: fullTrade } = await supabase
                .from("index_trades")
                .select(`
                  *,
                  author:profiles!author_id(id, full_name, avatar_url),
                  analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)
                `)
                .eq("id", trade.id)
                .single();

              if (fullTrade) {
                await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    type: "new_trade",
                    data: fullTrade,
                    channelId: fullTrade.analysis?.telegram_channel_id || channelId,
                    isNewHigh: true,
                  }),
                });
              }
            } catch (e) {
              console.error("Failed to send new high notification:", e);
            }
          }
        }

        let statusChanged = false;
        let newStatus = "active";
        let condition = "";

        const comparePrice = trade.trade_price_basis === "UNDERLYING_PRICE" ? newUnderlying : newContract;
        const compareEntry = trade.trade_price_basis === "UNDERLYING_PRICE" ? (trade.entry_underlying_snapshot?.price || 0) : entryPrice;

        if (target1Price) {
          const isCall = trade.direction === "call";
          const targetHit = isCall ? comparePrice >= target1Price : comparePrice <= target1Price;

          if (targetHit) {
            newStatus = "tp_hit";
            condition = `Target 1 reached at $${comparePrice.toFixed(4)} (Target: $${target1Price.toFixed(4)})`;
            statusChanged = true;
            results.winDetected++;
          }
        }

        if (!statusChanged && stopPrice) {
          const isCall = trade.direction === "call";
          const stopHit = isCall ? comparePrice <= stopPrice : comparePrice >= stopPrice;

          if (stopHit) {
            newStatus = "sl_hit";
            condition = `Stop loss hit at $${comparePrice.toFixed(4)} (Stop: $${stopPrice.toFixed(4)})`;
            statusChanged = true;
            results.lossDetected++;
          }
        }

        if (statusChanged) {
          updates.status = newStatus;
          updates.closed_at = new Date().toISOString();

          if (newStatus === "tp_hit") {
            updates.win_condition_met = condition;
          } else if (newStatus === "sl_hit") {
            updates.loss_condition_met = condition;
          }

          await supabase.from("trade_updates").insert({
            trade_id: trade.id,
            author_id: trade.author_id,
            text_en: condition,
            text_ar: condition,
            update_type: newStatus === "tp_hit" ? "target_hit" : "stop_hit",
          });

          const channelId = trade.analysis?.telegram_channel_id;
          if (channelId) {
            try {
              const { data: fullTrade } = await supabase
                .from("index_trades")
                .select(`
                  *,
                  author:profiles!author_id(id, full_name, avatar_url),
                  analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)
                `)
                .eq("id", trade.id)
                .single();

              if (fullTrade) {
                await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    type: "trade_result",
                    data: fullTrade,
                    channelId: fullTrade.analysis?.telegram_channel_id || channelId,
                  }),
                });
              }
            } catch (e) {
              console.error("Failed to trigger Telegram:", e);
            }
          }
        }

        const { error: updateError } = await supabase
          .from("index_trades")
          .update(updates)
          .eq("id", trade.id);

        if (updateError) {
          results.errors++;
        } else {
          results.updated++;
        }

        results.processed++;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (tradeError) {
        console.error("Error processing trade:", tradeError);
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Completed in ${duration}ms:`, results);

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

        return {
          ticker: ticker,
          price: mid || quote.bid_price || quote.ask_price,
          bid: quote.bid_price,
          ask: quote.ask_price,
          last: quote.bid_price,
          updated: quote.sip_timestamp,
        };
      }
    } else if (isIndex) {
      if (data.status === "OK" && data.results && data.results.length > 0) {
        const snapshot = data.results[0];
        const price = snapshot.value || snapshot.session?.close || snapshot.session?.previous_close;

        console.log(`Index snapshot for ${ticker}:`, JSON.stringify(snapshot));

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