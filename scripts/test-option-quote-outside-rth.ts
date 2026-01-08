/**
 * Test script to check if Polygon returns option quotes outside RTH
 *
 * This will help diagnose why contract prices aren't updating
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function testOptionQuote() {
  // Test with the example ticker from the user: SPX 6920 Put
  // We need to construct the proper Polygon options ticker

  // Example format: O:SPX251219P06920000
  // Let's test a few different SPX put options

  const testTickers = [
    'O:SPX251219P06920000', // December 19, 2025 - 6920 Put
    'O:SPX250110P06900000', // January 10, 2025 - 6900 Put
    'O:SPX250117P06900000', // January 17, 2025 - 6900 Put
  ];

  console.log('Testing option quotes outside RTH...\n');
  console.log('Polygon API Key:', POLYGON_API_KEY ? 'Set' : 'NOT SET');
  console.log('Current time:', new Date().toISOString());
  console.log('---\n');

  for (const ticker of testTickers) {
    console.log(`\nTesting ticker: ${ticker}`);

    try {
      // Method 1: Latest quote endpoint (what the trade tracker uses)
      const quoteUrl = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
      console.log('Fetching from:', quoteUrl.replace(POLYGON_API_KEY!, '[REDACTED]'));

      const quoteResponse = await fetch(quoteUrl);
      console.log('Quote endpoint status:', quoteResponse.status);

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        console.log('Quote response:', JSON.stringify(quoteData, null, 2));

        if (quoteData.results && quoteData.results.length > 0) {
          const quote = quoteData.results[0];
          const mid = (quote.bid_price + quote.ask_price) / 2;
          console.log('✅ Found quote:');
          console.log(`   Bid: $${quote.bid_price}`);
          console.log(`   Ask: $${quote.ask_price}`);
          console.log(`   Mid: $${mid}`);
          console.log(`   Timestamp: ${new Date(quote.sip_timestamp / 1000000).toISOString()}`);
        } else {
          console.log('❌ No results in quote response');
        }
      } else {
        const errorText = await quoteResponse.text();
        console.error('❌ Quote endpoint error:', errorText);
      }

      // Method 2: Snapshot endpoint (alternative)
      console.log('\nTrying snapshot endpoint...');
      const underlying = 'SPX';
      const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${underlying}/${ticker}?apiKey=${POLYGON_API_KEY}`;

      const snapshotResponse = await fetch(snapshotUrl);
      console.log('Snapshot endpoint status:', snapshotResponse.status);

      if (snapshotResponse.ok) {
        const snapshotData = await snapshotResponse.json();
        console.log('Snapshot response:', JSON.stringify(snapshotData, null, 2));
      } else {
        const errorText = await snapshotResponse.text();
        console.error('Snapshot error:', errorText);
      }

    } catch (error) {
      console.error('❌ Error:', error);
    }

    console.log('\n' + '='.repeat(80));
  }
}

testOptionQuote().catch(console.error);
