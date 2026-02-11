import 'dotenv/config';

async function testSnapshot() {
  const tradeId = '0bf20ee3-cc1f-4035-94c7-4c63c24e24b6';
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-trade-snapshot`;

  console.log('Testing snapshot generation...');
  console.log('URL:', url);
  console.log('Trade ID:', tradeId);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tradeId,
        isNewHigh: false
      })
    });

    console.log('\nResponse Status:', response.status);
    console.log('Response Status Text:', response.statusText);

    const text = await response.text();
    console.log('\nResponse Body:', text);

    if (response.ok) {
      try {
        const json = JSON.parse(text);
        console.log('\nParsed JSON:');
        console.log('  Image URL:', json.imageUrl);
        console.log('  Success:', json.success);
      } catch (e) {
        console.log('Could not parse as JSON');
      }
    }
  } catch (error: any) {
    console.error('\nError:', error.message);
  }
}

testSnapshot().catch(console.error);
