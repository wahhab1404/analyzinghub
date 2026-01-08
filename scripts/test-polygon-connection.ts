import 'dotenv/config';

async function testPolygonAPI() {
  const apiKey = process.env.POLYGON_API_KEY;

  if (!apiKey) {
    console.error('❌ POLYGON_API_KEY not found in environment');
    return;
  }

  console.log('=== TESTING POLYGON API CONNECTION ===\n');
  console.log('API Key:', apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4));

  // Test with a real SPX option
  const testContract = 'O:SPXW260108P06890000';
  const url = `https://api.polygon.io/v3/snapshot/options/${testContract}?apiKey=${apiKey}`;

  try {
    console.log(`\nFetching quote for: ${testContract}`);
    const response = await fetch(url);

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const text = await response.text();
      console.error('\n❌ Error Response:', text);
      return;
    }

    const data = await response.json();
    console.log('\n✅ SUCCESS! Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.results) {
      console.log('\n📊 Quote Details:');
      console.log(`  Last Price: $${data.results.last_quote?.midpoint || 'N/A'}`);
      console.log(`  Updated: ${new Date(data.results.last_quote?.last_updated).toLocaleString()}`);
    }

  } catch (error) {
    console.error('\n❌ Network Error:', error);
  }
}

testPolygonAPI().catch(console.error);
