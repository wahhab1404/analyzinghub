import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalysisWithActivation {
  id: string;
  index_symbol: string;
  invalidation_price: number | null;
  activation_enabled: boolean;
  activation_type: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE';
  activation_price: number;
  activation_timeframe: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE';
  activation_status: string;
  last_eval_price: number | null;
  preactivation_stop_touched: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔍 [activation-checker] Starting activation condition check...");

    // Fetch index analyses waiting for activation
    const { data: analyses, error: fetchError } = await supabase
      .from("index_analyses")
      .select(`
        *
      `)
      .eq("activation_enabled", true)
      .eq("activation_status", "published_inactive")
      .not("activation_price", "is", null)
      .not("activation_type", "is", null);

    if (fetchError) {
      console.error("❌ Failed to fetch analyses:", fetchError);
      throw fetchError;
    }

    if (!analyses || analyses.length === 0) {
      console.log("✅ No analyses waiting for activation");
      return new Response(
        JSON.stringify({ success: true, message: "No analyses to check", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Checking ${analyses.length} analyses for activation`);

    const results = {
      checked: analyses.length,
      activated: 0,
      preactivation_stops: 0,
      errors: 0,
    };

    for (const analysis of analyses as AnalysisWithActivation[]) {
      try {
        console.log(`\n🔍 Checking analysis ${analysis.id} (${analysis.index_symbol})`);

        // Get current price based on timeframe
        const priceData = await fetchPriceForTimeframe(
          analysis.index_symbol,
          analysis.activation_timeframe,
          polygonApiKey
        );

        if (!priceData) {
          console.log(`⚠️  No price data for ${analysis.index_symbol}`);
          continue;
        }

        console.log(`💰 Price data: ${JSON.stringify(priceData)}`);

        // Check for pre-activation invalidation price touch
        if (!analysis.preactivation_stop_touched && analysis.invalidation_price) {
          const invalidationTouched = priceData.current <= analysis.invalidation_price;

          if (invalidationTouched) {
            console.log(`🛑 Pre-activation invalidation price touched for ${analysis.id}`);

            const { error: stopError } = await supabase
              .from("index_analyses")
              .update({
                preactivation_stop_touched: true,
                preactivation_stop_touched_at: new Date().toISOString()
              })
              .eq("id", analysis.id);

            if (stopError) {
              console.error("Error marking pre-activation stop:", stopError);
            } else {
              results.preactivation_stops++;
            }
          }
        }

        // Check activation condition
        const isActivated = evaluateActivationCondition(
          analysis,
          priceData.current,
          priceData.previous
        );

        if (isActivated) {
          console.log(`✅ Activation condition met for ${analysis.id}`);

          const { error: activateError } = await supabase
            .from("index_analyses")
            .update({
              activation_status: 'active',
              activated_at: new Date().toISOString(),
              activation_met_at: new Date().toISOString(),
              activation_notes: `Activated at ${priceData.current} via ${analysis.activation_timeframe} check`
            })
            .eq("id", analysis.id);

          if (activateError) {
            console.error("Error activating analysis:", activateError);
            results.errors++;
          } else {
            results.activated++;
          }
        } else {
          // Update last eval price for next check
          await supabase
            .from("index_analyses")
            .update({
              last_eval_price: priceData.current,
              last_eval_at: new Date().toISOString(),
            })
            .eq("id", analysis.id);
        }
      } catch (analysisError: any) {
        console.error(`❌ Error checking analysis ${analysis.id}:`, analysisError);
        results.errors++;
      }
    }

    console.log("\n✅ [activation-checker] Completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ [activation-checker] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchPriceForTimeframe(
  symbol: string,
  timeframe: string,
  apiKey: string
): Promise<{ current: number; previous: number | null } | null> {
  try {
    // For INTRABAR, use snapshot (current/last trade)
    if (timeframe === "INTRABAR") {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Polygon snapshot error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data.status === "OK" && data.ticker) {
        return {
          current: data.ticker.lastTrade?.p || data.ticker.day?.c || 0,
          previous: data.ticker.prevDay?.c || null,
        };
      }
      return null;
    }

    // For candle-based timeframes, fetch aggregates
    const timespan = timeframe === "1H_CLOSE" ? "hour" : timeframe === "4H_CLOSE" ? "hour" : "day";
    const multiplier = timeframe === "4H_CLOSE" ? 4 : 1;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Get last 7 days of data

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=2&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Polygon aggregates error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.status === "OK" && data.results && data.results.length > 0) {
      // Most recent completed candle
      const latestCandle = data.results[0];
      const previousCandle = data.results[1];
      
      return {
        current: latestCandle.c, // close price
        previous: previousCandle ? previousCandle.c : null,
      };
    }

    return null;
  } catch (error) {
    console.error("Error fetching price:", error);
    return null;
  }
}

function evaluateActivationCondition(
  analysis: AnalysisWithActivation,
  currentPrice: number,
  previousPrice: number | null
): boolean {
  const { activation_type, activation_price, last_eval_price } = analysis;

  switch (activation_type) {
    case "ABOVE_PRICE":
      return currentPrice > activation_price;

    case "UNDER_PRICE":
      return currentPrice < activation_price;

    case "PASSING_PRICE":
      // Need previous price to detect crossing
      const priceToCompare = last_eval_price || previousPrice;
      if (priceToCompare === null) {
        return false;
      }

      // Generic crossing (either direction)
      return (
        (priceToCompare <= activation_price && currentPrice > activation_price) ||
        (priceToCompare >= activation_price && currentPrice < activation_price)
      );

    default:
      return false;
  }
}
