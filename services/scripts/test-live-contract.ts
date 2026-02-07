import 'dotenv/config';

const apiKey = process.env.POLYGON_API_KEY;
const ticker = 'O:SPXW260114P06870000';

async function testContract() {
  console.log('Testing contract:', ticker);
  console.log('Time:', new Date().toISOString());
  console.log('');

  const url = 'https://api.polygon.io/v3/snapshot/options/' + encodeURIComponent(ticker) + '?apiKey=' + apiKey;

  console.log('URL:', url);
  console.log('');

  const response = await fetch(url);
  console.log('Status:', response.status, response.statusText);
  console.log('');

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));

  if (data.results && !Array.isArray(data.results)) {
    const quote = data.results.last_quote || {};
    console.log('');
    console.log('Quote Details:');
    console.log('  Bid:', quote.bid || 'N/A');
    console.log('  Ask:', quote.ask || 'N/A');
    console.log('  Last:', quote.last_price || 'N/A');
    if (quote.bid && quote.ask) {
      console.log('  Mid:', ((quote.bid + quote.ask) / 2).toFixed(4));
    }
  }
}

testContract().catch(console.error);
