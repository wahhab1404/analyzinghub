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
      return new Response(
        JSON.stringify({ ok: false, error: "Trade not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
    const currentPrice = trade.current_contract || entryPrice;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = (priceChange / entryPrice) * 100;

    const underlyingPrice = trade.current_underlying || trade.entry_underlying_snapshot?.price || 0;
    const underlyingEntryPrice = trade.entry_underlying_snapshot?.price || underlyingPrice;
    const underlyingChange = underlyingPrice - underlyingEntryPrice;
    const underlyingChangePercent = (underlyingChange / underlyingEntryPrice) * 100;

    const mid = trade.entry_contract_snapshot?.mid || currentPrice;
    const openInterest = trade.entry_contract_snapshot?.open_interest || 0;
    const volume = trade.entry_contract_snapshot?.volume || 0;

    const now = new Date();
    const timestamp = `Open, ${now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })} ${now.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "2-digit",
    })} ET`;

    const data = {
      symbol: trade.polygon_option_ticker || "SPX",
      strike: trade.strike || 0,
      expiry: trade.expiry || new Date().toISOString(),
      optionType: trade.option_type === "call" ? "Call" : "Put",
      currentPrice,
      entryPrice,
      priceChange,
      priceChangePercent,
      mid,
      openInterest,
      volume,
      underlyingSymbol: trade.analysis?.index_symbol || "SPX",
      underlyingPrice,
      underlyingChange,
      underlyingChangePercent,
      timestamp,
      isNewHigh: payload.isNewHigh || false,
    };

    const isPriceUp = data.priceChange >= 0;
    const priceColor = isPriceUp ? "#10b981" : "#ef4444";
    const priceArrow = isPriceUp ? "▲" : "▼";
    const isUnderlyingUp = data.underlyingChange >= 0;

    const formatExpiry = (expiry: string) => {
      const date = new Date(expiry);
      return date.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', sans-serif;
      background: #ffffff;
      width: 1280px;
      height: 720px;
      padding: 48px 60px;
      position: relative;
    }
    .container { height: 100%; display: flex; flex-direction: column; }
    .header { margin-bottom: 48px; }
    .title { font-size: 56px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; letter-spacing: -0.5px; }
    .subtitle { font-size: 28px; color: #8e8e93; font-weight: 400; }
    .content-section { display: flex; justify-content: space-between; margin-bottom: 48px; flex: 1; }
    .left-section { display: flex; flex-direction: column; justify-content: center; }
    .current-price { font-size: 140px; font-weight: 700; color: ${priceColor}; line-height: 1; margin-bottom: 20px; letter-spacing: -2px; }
    .price-change { display: flex; gap: 16px; align-items: center; font-size: 38px; font-weight: 600; color: ${priceColor}; }
    .right-section { display: flex; flex-direction: column; gap: 24px; justify-content: center; min-width: 320px; }
    .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
    .stat-label { font-size: 24px; color: #8e8e93; font-weight: 400; }
    .stat-value { font-size: 32px; color: #1a1a1a; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 24px; border-top: 2px solid #f0f0f0; }
    .underlying-info { display: flex; gap: 28px; align-items: center; }
    .underlying-symbol { font-size: 32px; color: #1a1a1a; font-weight: 600; }
    .underlying-price { font-size: 32px; color: ${isUnderlyingUp ? "#34c759" : "#8e8e93"}; font-weight: 600; }
    .timestamp { font-size: 24px; color: #8e8e93; }
    ${data.isNewHigh ? `
    .new-high-badge {
      position: absolute;
      top: 48px;
      right: 60px;
      background: linear-gradient(135deg, #34c759 0%, #30d158 100%);
      color: white;
      padding: 18px 36px;
      border-radius: 16px;
      font-size: 28px;
      font-weight: 700;
      box-shadow: 0 12px 24px rgba(52, 199, 89, 0.35);
      letter-spacing: 0.5px;
    }
    ` : ""}
  </style>
</head>
<body>
  ${data.isNewHigh ? '<div class="new-high-badge">🚀 NEW HIGH!</div>' : ""}
  <div class="container">
    <div class="header">
      <div class="title">${data.symbol.split(":")[1] || data.symbol} $${data.strike.toLocaleString()}</div>
      <div class="subtitle">${formatExpiry(data.expiry)} (W) ${data.optionType} ${Math.abs(data.openInterest).toLocaleString()}</div>
    </div>
    <div class="content-section">
      <div class="left-section">
        <div class="current-price">${data.currentPrice.toFixed(2)}</div>
        <div class="price-change">
          <span>${priceArrow}${Math.abs(data.priceChange).toFixed(2)}</span>
          <span>${data.priceChangePercent.toFixed(2)}%</span>
        </div>
      </div>
      <div class="right-section">
        <div class="stat-row">
          <span class="stat-label">Mid</span>
          <span class="stat-value">${data.mid.toFixed(2)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Open Int.</span>
          <span class="stat-value">${Math.abs(data.openInterest).toLocaleString()}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Vol.</span>
          <span class="stat-value">${Math.abs(data.volume).toLocaleString()}</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="underlying-info">
        <span class="underlying-symbol">${data.underlyingSymbol}</span>
        <span class="underlying-price">
          ${data.underlyingPrice.toFixed(2)}
          ${data.underlyingChangePercent >= 0 ? "+" : ""}${data.underlyingChangePercent.toFixed(2)}%
        </span>
      </div>
      <div class="timestamp">${data.timestamp}</div>
    </div>
  </div>
</body>
</html>`;

    const screenshotApiKey = Deno.env.get("SCREENSHOT_API_KEY") || "VHC72UO-TWQF3WH-N8SXQDS-R77KQPZ";
    const screenshotUrl = `https://shot.screenshotapi.net/screenshot`;

    const contractUrl = trade.contract_url;
    let screenshotParams;

    if (contractUrl) {
      screenshotParams = new URLSearchParams({
        token: screenshotApiKey,
        url: contractUrl,
        width: "1200",
        height: "800",
        output: "image",
        file_type: "png",
        wait_for_event: "networkidle",
        delay: "2000",
        full_page: "false",
      });
    } else {
      screenshotParams = new URLSearchParams({
        token: screenshotApiKey,
        url: `data:text/html,${encodeURIComponent(html)}`,
        width: "1280",
        height: "720",
        output: "image",
        file_type: "png",
        wait_for_event: "load",
      });
    }

    console.log("[generate-trade-snapshot] Fetching screenshot...");
    const screenshotResponse = await fetch(`${screenshotUrl}?${screenshotParams.toString()}`);

    if (!screenshotResponse.ok) {
      throw new Error(`Screenshot API failed: ${screenshotResponse.statusText}`);
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

    const { data: publicUrlData } = supabase.storage
      .from("chart-images")
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    console.log("[generate-trade-snapshot] Snapshot generated successfully:", publicUrl);

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