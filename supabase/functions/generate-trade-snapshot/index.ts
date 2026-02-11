import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SnapshotRequest {
  tradeId: string;
  isNewHigh?: boolean;
  newHighPrice?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: SnapshotRequest = await req.json();
    console.log("[generate-trade-snapshot] Generating snapshot for trade:", payload.tradeId);

    const { data: trade, error: tradeError } = await supabase
      .from("index_trades")
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq("id", payload.tradeId)
      .single();

    if (tradeError || !trade) {
      console.error("[generate-trade-snapshot] Trade not found:", tradeError);
      return new Response(
        JSON.stringify({ ok: false, error: "Trade not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("[generate-trade-snapshot] Trade data:", {
      id: trade.id,
      ticker: trade.polygon_option_ticker,
      hasEntrySnapshot: !!trade.entry_contract_snapshot,
      entrySnapshot: trade.entry_contract_snapshot,
      currentPrice: trade.current_contract,
      currentUnderlying: trade.current_underlying,
      entryUnderlying: trade.entry_underlying_snapshot,
    });

    const appBaseUrl = Deno.env.get("APP_BASE_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
    const isNewHighParam = payload.isNewHigh ? 'isNewHigh=true' : '';
    const newHighPriceParam = payload.newHighPrice ? `newHighPrice=${payload.newHighPrice}` : '';
    const queryParams = [isNewHighParam, newHighPriceParam].filter(Boolean).join('&');
    const imageGenerationUrl = `${appBaseUrl}/api/indices/trades/${payload.tradeId}/generate-image${queryParams ? '?' + queryParams : ''}`;
    console.log("[generate-trade-snapshot] Local image generation URL:", imageGenerationUrl, "isNewHigh:", payload.isNewHigh, "newHighPrice:", payload.newHighPrice);

    console.log("[generate-trade-snapshot] Using local image generation...");

    const screenshotResponse = await fetch(imageGenerationUrl);

    if (!screenshotResponse.ok) {
      const errorBody = await screenshotResponse.text();
      console.error("[generate-trade-snapshot] Image generation error:", {
        status: screenshotResponse.status,
        statusText: screenshotResponse.statusText,
        body: errorBody,
      });

      throw new Error(`Image generation failed: ${screenshotResponse.statusText} - ${errorBody}`);
    }

    const imageBlob = await screenshotResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    const fileName = `trade-snapshots/${trade.author_id}/${payload.tradeId}-${Date.now()}.png`;

    console.log("[generate-trade-snapshot] Uploading to Supabase Storage...");
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("chart-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate-trade-snapshot] Upload error:", uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    console.log("[generate-trade-snapshot] Upload successful:", uploadData);

    const actualPath = uploadData.path;
    const { data: publicUrlData } = supabase.storage
      .from("chart-images")
      .getPublicUrl(actualPath);

    const publicUrl = publicUrlData.publicUrl;

    console.log("[generate-trade-snapshot] Snapshot generated successfully");
    console.log("[generate-trade-snapshot] Public URL:", publicUrl);

    const { error: updateError } = await supabase
      .from("index_trades")
      .update({
        contract_url: publicUrl,
      })
      .eq("id", payload.tradeId);

    if (updateError) {
      console.error("[generate-trade-snapshot] Failed to update trade with snapshot URL:", updateError);
    } else {
      console.log("[generate-trade-snapshot] Trade updated with snapshot URL");
    }

    return new Response(
      JSON.stringify({
        ok: true,
        imageUrl: publicUrl,
        fileName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[generate-trade-snapshot] Error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});