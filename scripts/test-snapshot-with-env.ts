import 'dotenv/config';

async function testSnapshot() {
  const tradeId = '0bf20ee3-cc1f-4035-94c7-4c63c24e24b6';

  // Test if the local API endpoint works
  const localUrl = `http://localhost:3000/api/indices/trades/${tradeId}/generate-image`;
  console.log('Testing local image generation endpoint...');
  console.log('URL:', localUrl);

  try {
    const response = await fetch(localUrl);
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));

    if (response.ok) {
      console.log('✅ Local image endpoint is working!');
      const buffer = await response.arrayBuffer();
      console.log('Image size:', buffer.byteLength, 'bytes');
    } else {
      const text = await response.text();
      console.log('❌ Error:', text.substring(0, 500));
    }
  } catch (error: any) {
    console.error('❌ Failed to connect:', error.message);
  }

  console.log('\n---\n');

  // Now test the edge function
  const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-trade-snapshot`;
  console.log('Testing edge function with local URL override...');
  console.log('Edge Function URL:', edgeFunctionUrl);

  try {
    const response = await fetch(edgeFunctionUrl, {
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

    console.log('Status:', response.status);
    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log('✅ Snapshot generated successfully!');
      console.log('Image URL:', result.imageUrl);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testSnapshot().catch(console.error);
