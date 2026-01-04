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

        const previousContractHigh = trade.contract_high_since || newContract;
        const newContractHigh = Math.max(previousContractHigh, newContract);
        const isNewHigh = newContractHigh > previousContractHigh;

        updates.underlying_high_since = Math.max(
          trade.underlying_high_since || newUnderlying,
          newUnderlying
        );
        updates.underlying_low_since = Math.min(
          trade.underlying_low_since || newUnderlying,
          newUnderlying
        );
        updates.contract_high_since = newContractHigh;
        updates.contract_low_since = Math.min(
          trade.contract_low_since || newContract,
          newContract
        );

        const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const target1Price = trade.targets && trade.targets.length > 0 ? trade.targets[0]?.level : null;
        const stopPrice = trade.stoploss?.level;

        // Send new high notification if applicable
        if (isNewHigh) {
          const percentGain = ((newContractHigh - entryPrice) / entryPrice * 100).toFixed(2);
          console.log(`New high detected for trade ${trade.id}: $${newContractHigh} (+${percentGain}%)`);

          // Create update record
          await supabase.from("trade_updates").insert({
            trade_id: trade.id,
            author_id: trade.author_id,
            text_en: `🚀 New high! Contract price reached $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            text_ar: `🚀 قمة جديدة! وصل سعر العقد إلى $${newContractHigh.toFixed(4)} (+${percentGain}%)`,
            update_type: "new_high",
          });

          // Send to Telegram with snapshot
          const channelId = trade.analysis?.telegram_channel_id;
          if (channelId) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  entityType: "trade",
                  entityId: trade.id,
                  channelId: channelId,
                  isNewHigh: true,
                  forceResend: true,
                }),
              });
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
              await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  entityType: "trade_result",
                  entityId: trade.id,
                  channelId: channelId,
                }),
              });
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
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
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
    
    return null;
  } catch (error) {
    console.error("Error fetching quote:", error);
    return null;
  }
}
