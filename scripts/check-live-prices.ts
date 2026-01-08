import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPrices() {
  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, current_contract, contract_high_since, last_quote_at, last_rth_tracking_at, is_using_manual_price, manual_contract_price, current_contract_snapshot')
    .eq('status', 'active')
    .order('last_quote_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n=== Active Trades Price Status ===\n');

  for (const trade of trades || []) {
    const tradeIdShort = trade.id.substring(0, 8);
    console.log(`Trade ID: ${tradeIdShort}`);
    console.log(`  Ticker: ${trade.polygon_option_ticker}`);
    console.log(`  Current Price: $${trade.current_contract}`);
    console.log(`  High Since Entry: $${trade.contract_high_since}`);
    console.log(`  Manual Price: ${trade.is_using_manual_price ? 'Yes ($' + trade.manual_contract_price + ')' : 'No'}`);
    console.log(`  Last Quote: ${new Date(trade.last_quote_at).toLocaleString()}`);
    console.log(`  Last RTH Track: ${trade.last_rth_tracking_at ? new Date(trade.last_rth_tracking_at).toLocaleString() : 'Never'}`);

    if (trade.current_contract_snapshot) {
      console.log(`  Snapshot: Bid=${trade.current_contract_snapshot.bid}, Ask=${trade.current_contract_snapshot.ask}, Mid=${trade.current_contract_snapshot.mid}`);
    }
    console.log('');
  }

  const polygonKey = process.env.POLYGON_API_KEY;
  if (trades && trades.length > 0 && polygonKey) {
    const ticker = trades[0].polygon_option_ticker;
    console.log(`\nFetching live quote from Polygon for ${ticker}...\n`);

    const response = await fetch(
      `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apiKey=${polygonKey}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const quote = data.results[0];
      const mid = (quote.bid_price + quote.ask_price) / 2;
      console.log('Live Polygon Quote:');
      console.log(`  Bid: $${quote.bid_price}`);
      console.log(`  Ask: $${quote.ask_price}`);
      console.log(`  Mid: $${mid}`);
      console.log(`  Time: ${new Date(quote.sip_timestamp / 1000000).toLocaleString()}`);
      console.log(`\nDatabase has: $${trades[0].current_contract}`);
      console.log(`Difference: $${Math.abs(mid - trades[0].current_contract).toFixed(4)}`);
    } else {
      console.log('Polygon response:', JSON.stringify(data, null, 2));
    }
  }
}

checkPrices();
