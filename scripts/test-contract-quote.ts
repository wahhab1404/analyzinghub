import 'dotenv/config';

const apiKey = process.env.POLYGON_API_KEY;
const ticker = 'O:SPXW260114P06870000';

async function testContractQuote() {
  console.log('=== Testing Contract Quote ===');
  console.log('Contract:', ticker);
  console.log('Time:', new Date().toISOString());
  console.log('');

  // Try snapshot endpoint
  console.log('1. Testing Snapshot endpoint...');
  const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(ticker)}?apiKey=${apiKey}`;
  const snapshotRes = await fetch(snapshotUrl);
  const snapshotData = await snapshotRes.json();
  console.log('Snapshot response:', JSON.stringify(snapshotData, null, 2));
  console.log('');

  // Try quote endpoint
  console.log('2. Testing Quote endpoint...');
  const quoteUrl = `https://api.polygon.io/v3/quotes/${encodeURIComponent(ticker)}?limit=1&order=desc&sort=timestamp&apiKey=${apiKey}`;
  const quoteRes = await fetch(quoteUrl);
  const quoteData = await quoteRes.json();
  console.log('Quote response:', JSON.stringify(quoteData, null, 2));
  console.log('');

  // Test underlying SPX
  console.log('3. Testing Underlying Index (SPX)...');
  const indexUrl = `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=I:SPX&apiKey=${apiKey}`;
  const indexRes = await fetch(indexUrl);
  const indexData = await indexRes.json();
  console.log('Index response:', JSON.stringify(indexData, null, 2));
  console.log('');

  // Try searching for SPX options chains
  console.log('4. Searching for active SPX options...');
  const chainUrl = `https://api.polygon.io/v3/snapshot/options/SPX?strike_price=6870&option_type=put&expiration_date=2026-01-14&limit=5&apiKey=${apiKey}`;
  const chainRes = await fetch(chainUrl);
  const chainData = await chainRes.json();
  console.log('Options chain response:', JSON.stringify(chainData, null, 2));
}

testContractQuote().catch(console.error);
