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
  console.log("[analysis-target-checker] Starting target check cycle");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    if (!polygonApiKey) {
      throw new Error("POLYGON_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: analyses, error: analysesError } = await supabase
      .from("index_analyses")
      .select("id, index_symbol, title, author_id, targets, targets_hit, telegram_channel_id")
      .eq("status", "published")
      .order("last_target_check_at", { ascending: true, nullsFirst: true })
      .limit(50);

    const analysesWithTargets = (analyses || []).filter(
      (a: any) => a.targets && Array.isArray(a.targets) && a.targets.length > 0
    );

    if (analysesError) {
      console.error("Error fetching analyses:", analysesError);
      throw analysesError;
    }

    if (!analysesWithTargets || analysesWithTargets.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No analyses with targets to check", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${analysesWithTargets.length} analyses with targets to check`);

    const results = {
      processed: 0,
      targetsHit: 0,
      errors: 0,
    };

    for (const analysis of analysesWithTargets) {
      try {
        const { data: indexRef } = await supabase
          .from("indices_reference")
          .select("polygon_index_ticker")
          .eq("index_symbol", analysis.index_symbol)
          .single();

        if (!indexRef) {
          console.error(`Index not found: ${analysis.index_symbol}`);
          continue;
        }

        const currentPrice = await fetchPolygonPrice(
          indexRef.polygon_index_ticker,
          polygonApiKey
        );

        if (!currentPrice) {
          console.error(`Failed to fetch price for ${indexRef.polygon_index_ticker}`);
          continue;
        }

        const targets = analysis.targets || [];
        const targetsHit = analysis.targets_hit || [];
        const newTargetsHit: number[] = [];

        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          
          if (targetsHit.includes(i) || target.reached) {
            continue;
          }

          const targetLevel = parseFloat(target.level);
          const tolerance = targetLevel * 0.001;
          const priceReached = Math.abs(currentPrice - targetLevel) <= tolerance;

          if (priceReached) {
            console.log(`Target ${i} hit for analysis ${analysis.id}: $${currentPrice} (Target: $${targetLevel})`);
            newTargetsHit.push(i);

            targets[i] = {
              ...target,
              reached: true,
              reached_at: new Date().toISOString(),
            };

            await supabase.from("analysis_target_hits").insert({
              analysis_id: analysis.id,
              target_index: i,
              target_level: targetLevel,
              hit_price: currentPrice,
            });

            const updateText = `🎯 ${target.label || `Target ${i + 1}`} reached at $${currentPrice.toFixed(2)}!`;
            await supabase.from("analysis_updates").insert({
              analysis_id: analysis.id,
              author_id: analysis.author_id,
              body: updateText,
              text_en: updateText,
              text_ar: `🎯 ${target.label || `الهدف ${i + 1}`} تم الوصول إلى $${currentPrice.toFixed(2)}!`,
              update_type: "target_hit",
            });

            if (analysis.telegram_channel_id) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    entityType: "analysis_update",
                    entityId: analysis.id,
                    channelId: analysis.telegram_channel_id,
                  }),
                });
              } catch (e) {
                console.error("Failed to send Telegram notification:", e);
              }
            }

            results.targetsHit++;
          }
        }

        if (newTargetsHit.length > 0) {
          await supabase
            .from("index_analyses")
            .update({
              targets,
              targets_hit: [...targetsHit, ...newTargetsHit],
              last_target_check_at: new Date().toISOString(),
            })
            .eq("id", analysis.id);
        } else {
          await supabase
            .from("index_analyses")
            .update({ last_target_check_at: new Date().toISOString() })
            .eq("id", analysis.id);
        }

        results.processed++;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error("Error processing analysis:", error);
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

async function fetchPolygonPrice(ticker: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v3/snapshot?ticker.any_of=${ticker}&apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.status === "OK" && data.results && data.results.length > 0) {
      const snapshot = data.results[0];
      const price = snapshot.value || snapshot.session?.close || snapshot.session?.previous_close || null;
      console.log(`Fetched ${ticker}: $${price}`);
      return price;
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching price:", error);
    return null;
  }
}