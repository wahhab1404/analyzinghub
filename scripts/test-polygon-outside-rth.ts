import 'dotenv/config';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testPolygonQuote(ticker: string, description: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${description}`);
  console.log(`Ticker: ${ticker}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const isOption = ticker.startsWith('O:');
    const isIndex = ticker.startsWith('I:');

    let url: string;
    if (isOption) {
      url = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
    } else if (isIndex) {
      url = `https://api.polygon.io/v3/snapshot?ticker.any_of=${ticker}&apiKey=${POLYGON_API_KEY}`;
    } else {
      url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
    }

    console.log(`\nAPI URL: ${url.replace(POLYGON_API_KEY!, 'HIDDEN')}`);

    const response = await fetch(url);
    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`\nResponse Data:`);
    console.log(JSON.stringify(data, null, 2));

    if (isOption && data.status === "OK" && data.results && data.results.length > 0) {
      const quote = data.results[0];
      const mid = (quote.bid_price + quote.ask_price) / 2;
      console.log(`\n✅ Option Quote Found:`);
      console.log(`   Bid: $${quote.bid_price}`);
      console.log(`   Ask: $${quote.ask_price}`);
      console.log(`   Mid: $${mid.toFixed(4)}`);
      console.log(`   Updated: ${new Date(quote.sip_timestamp / 1000000).toISOString()}`);
      return true;
    } else if (isIndex && data.status === "OK" && data.results && data.results.length > 0) {
      const snapshot = data.results[0];
      const price = snapshot.value || snapshot.session?.close || snapshot.session?.previous_close;
      console.log(`\n✅ Index Quote Found:`);
      console.log(`   Value: $${price}`);
      console.log(`   Updated: ${snapshot.updated || 'N/A'}`);
      return true;
    } else {
      console.log(`\n❌ No valid quote data found`);
      return false;
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('POLYGON API - OUTSIDE RTH DIAGNOSTIC TEST');
  console.log('='.repeat(60));
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log(`Current Time ET: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  // Test underlying index
  await testPolygonQuote('I:SPX', 'SPX Index (Underlying)');

  // Test a sample option from your trades
  await testPolygonQuote('O:SPXW260107P06915000', 'SPX Option - 0DTE (Today)');

  // Test a longer-dated option
  await testPolygonQuote('O:SPXW260108P06900000', 'SPX Option - 1DTE (Tomorrow)');

  console.log('\n' + '='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
