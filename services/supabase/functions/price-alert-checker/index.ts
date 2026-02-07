import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Analysis {
  id: string;
  author_id: string;
  symbol: string;
  title: string;
  entry_price: number;
  target_price: number;
  stop_loss: number;
  status: string;
}

interface NotificationPreferences {
  user_id: string;
  alerts_enabled: boolean;
  target_alerts_enabled: boolean;
  stop_alerts_enabled: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: analyses, error: analysesError } = await supabase
      .from("analyses")
      .select("*")
      .eq("status", "active");

    if (analysesError) {
      throw new Error(`Failed to fetch analyses: ${analysesError.message}`);
    }

    if (!analyses || analyses.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active analyses to check", checked: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      checked: 0,
      targets_hit: 0,
      stops_hit: 0,
      notifications_created: 0,
    };

    for (const analysis of analyses as Analysis[]) {
      results.checked++;

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", analysis.author_id)
        .maybeSingle();

      const preferences = prefs as NotificationPreferences | null;

      if (!preferences?.alerts_enabled) {
        continue;
      }

      let currentPrice: number | null = null;

      if (polygonApiKey) {
        try {
          const response = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${analysis.symbol}/prev?apiKey=${polygonApiKey}`
          );
          const data = await response.json();
          if (data.results?.[0]?.c) {
            currentPrice = data.results[0].c;
          }
        } catch (error) {
          console.error(`Failed to fetch price for ${analysis.symbol}:`, error);
        }
      }

      if (!currentPrice) {
        continue;
      }

      const entryPrice = analysis.entry_price;
      const targetPrice = analysis.target_price;
      const stopLoss = analysis.stop_loss;
      const isLong = targetPrice > entryPrice;

      let shouldNotify = false;
      let notificationType: string | null = null;
      let newStatus: string | null = null;

      if (isLong) {
        if (currentPrice >= targetPrice && preferences.target_alerts_enabled) {
          shouldNotify = true;
          notificationType = "target_hit";
          newStatus = "target_hit";
          results.targets_hit++;
        } else if (currentPrice <= stopLoss && preferences.stop_alerts_enabled) {
          shouldNotify = true;
          notificationType = "stop_hit";
          newStatus = "stop_hit";
          results.stops_hit++;
        }
      } else {
        if (currentPrice <= targetPrice && preferences.target_alerts_enabled) {
          shouldNotify = true;
          notificationType = "target_hit";
          newStatus = "target_hit";
          results.targets_hit++;
        } else if (currentPrice >= stopLoss && preferences.stop_alerts_enabled) {
          shouldNotify = true;
          notificationType = "stop_hit";
          newStatus = "stop_hit";
          results.stops_hit++;
        }
      }

      if (shouldNotify && notificationType && newStatus) {
        await supabase.from("analyses").update({ status: newStatus }).eq("id", analysis.id);

        const notificationMessage =
          notificationType === "target_hit"
            ? `Your target price of $${targetPrice} for ${analysis.symbol} has been hit! Current price: $${currentPrice.toFixed(2)}`
            : `Your stop loss of $${stopLoss} for ${analysis.symbol} has been hit! Current price: $${currentPrice.toFixed(2)}`;

        const { error: notifError } = await supabase.from("notifications").insert({
          user_id: analysis.author_id,
          analysis_id: analysis.id,
          type: notificationType,
          title: `${analysis.symbol} - ${notificationType === "target_hit" ? "Target Hit" : "Stop Loss Hit"}`,
          message: notificationMessage,
        });

        if (!notifError) {
          results.notifications_created++;
        }
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Alert checker error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to check alerts" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});