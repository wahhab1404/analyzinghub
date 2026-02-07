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

    const { data: indexAnalyses, error: indexFetchError } = await supabase
      .from("index_analyses")
      .select(`*`)
      .eq("activation_enabled", true)
      .eq("activation_status", "published_inactive")
      .not("activation_price", "is", null)
      .not("activation_type", "is", null);

    if (indexFetchError) {
      console.error("❌ Failed to fetch index analyses:", indexFetchError);
    }

    const { data: stockAnalyses, error: stockFetchError } = await supabase
      .from("analyses")
      .select(`*,symbols!inner(symbol)`)
      .eq("activation_enabled", true)
      .eq("activation_status", "published_inactive")
      .not("activation_price", "is", null)
      .not("activation_type", "is", null);

    if (stockFetchError) {
      console.error("❌ Failed to fetch stock analyses:", stockFetchError);
    }

    const indexAnalysesList = indexAnalyses || [];
    const stockAnalysesList = (stockAnalyses || []).map((a: any) => ({
      ...a,
      index_symbol: a.symbols.symbol,
      table: 'analyses'
    }));

    const analyses = [...indexAnalysesList.map((a: any) => ({ ...a, table: 'index_analyses' })), ...stockAnalysesList];

    if (analyses.length === 0) {
      console.log("✅ No analyses waiting for activation");
      return new Response(
        JSON.stringify({ success: true, message: "No analyses to check", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Checking ${analyses.length} analyses (${indexAnalysesList.length} index, ${stockAnalysesList.length} stock)`);

    const results = {
      checked: analyses.length,
      activated: 0,
      preactivation_stops: 0,
      errors: 0,
    };

    for (const analysis of analyses as any[]) {
      try {
        const tableName = analysis.table || 'index_analyses';
        console.log(`\n🔍 Checking ${analysis.id} (${analysis.index_symbol}) from ${tableName}`);

        const priceData = await fetchPriceForTimeframe(
          analysis.index_symbol,
          analysis.activation_timeframe,
          polygonApiKey
        );

        if (!priceData) {
          console.log(`⚠️  No price data for ${analysis.index_symbol}`);
          continue;
        }

        console.log(`💰 Current: ${priceData.current}, Previous: ${priceData.previous}, Activation: ${analysis.activation_price}`);

        const stopPrice = analysis.invalidation_price || analysis.stop_loss;
        if (!analysis.preactivation_stop_touched && stopPrice) {
          const stopTouched = priceData.current <= stopPrice;

          if (stopTouched) {
            console.log(`🛑 Pre-activation stop touched for ${analysis.id}`);
            const { error: stopError } = await supabase
              .from(tableName)
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

        const isActivated = evaluateActivationCondition(
          analysis,
          priceData.current,
          priceData.previous
        );

        if (isActivated) {
          console.log(`✅ Activation condition met for ${analysis.id}`);

          const { error: activateError } = await supabase
            .from(tableName)
            .update({
              activation_status: 'active',
              activated_at: new Date().toISOString(),
              activation_met_at: new Date().toISOString(),
              activation_notes: `Activated at ${priceData.current} via ${analysis.activation_timeframe} check`
            })
            .eq("id", analysis.id);

          if (activateError) {
            console.error("Error activating:", activateError);
            results.errors++;
          } else {
            results.activated++;
          }
        } else {
          await supabase
            .from(tableName)
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

    console.log("\n✅ Completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Error:", error);
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

    const timespan = timeframe === "1H_CLOSE" ? "hour" : timeframe === "4H_CLOSE" ? "hour" : "day";
    const multiplier = timeframe === "4H_CLOSE" ? 4 : 1;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=2&apiKey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Polygon aggregates error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.status === "OK" && data.results && data.results.length > 0) {
      const latestCandle = data.results[0];
      const previousCandle = data.results[1];
      
      return {
        current: latestCandle.c,
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

  console.log(`Evaluating ${activation_type}: current=${currentPrice}, activation=${activation_price}, last_eval=${last_eval_price}, previous=${previousPrice}`);

  switch (activation_type) {
    case "ABOVE_PRICE":
      return currentPrice > activation_price;

    case "UNDER_PRICE":
      return currentPrice < activation_price;

    case "PASSING_PRICE":
      if (last_eval_price === null) {
        if (previousPrice !== null) {
          const crossed = (
            (previousPrice <= activation_price && currentPrice > activation_price) ||
            (previousPrice >= activation_price && currentPrice < activation_price)
          );
          console.log(`First check with previous: crossed=${crossed}`);
          return crossed;
        } else {
          const tolerance = activation_price * 0.01;
          const alreadyPassed = Math.abs(currentPrice - activation_price) > tolerance;
          console.log(`First check without previous: alreadyPassed=${alreadyPassed} (tolerance=${tolerance})`);
          return alreadyPassed;
        }
      }

      const crossed = (
        (last_eval_price <= activation_price && currentPrice > activation_price) ||
        (last_eval_price >= activation_price && currentPrice < activation_price)
      );
      console.log(`Subsequent check: crossed=${crossed}`);
      return crossed;

    default:
      return false;
  }
}
