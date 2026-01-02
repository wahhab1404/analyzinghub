import 'dotenv/config';

async function testBroadcast() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Testing edge function with:');
  console.log('Supabase URL:', supabaseUrl);
  console.log('Service Key exists:', !!serviceKey);
  console.log('Service Key length:', serviceKey?.length);

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-channel-broadcast`;

  console.log('\nCalling edge function:', edgeFunctionUrl);

  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      userId: 'test-user-id',
      analysisId: 'test-analysis-id',
      eventType: 'new_analysis',
    }),
  });

  console.log('\nResponse status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers.entries()));

  const text = await response.text();
  console.log('\nResponse body:', text);

  try {
    const json = JSON.parse(text);
    console.log('\nParsed JSON:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON');
  }
}

testBroadcast().catch(console.error);
