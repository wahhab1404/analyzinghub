import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSnapshot() {
  console.log("Fetching the most recent trade...");

  const { data: trades, error: tradesError } = await supabase
    .from("index_trades")
    .select("id, polygon_option_ticker, status")
    .order("created_at", { ascending: false })
    .limit(1);

  if (tradesError || !trades || trades.length === 0) {
    console.error("No trades found:", tradesError);
    return;
  }

  const trade = trades[0];
  console.log("Testing snapshot for trade:", trade.id);

  const functionUrl = `${supabaseUrl}/functions/v1/generate-trade-snapshot`;
  console.log("Calling:", functionUrl);

  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        tradeId: trade.id,
        isNewHigh: false,
      }),
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log("Response body:", text);

    if (response.ok) {
      try {
        const data = JSON.parse(text);
        console.log("\nSnapshot generated!");
        console.log("Image URL:", data.imageUrl);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
      }
    }
  } catch (error: any) {
    console.error("Request failed:", error.message);
  }
}

testSnapshot();
