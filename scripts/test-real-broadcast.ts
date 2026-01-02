import 'dotenv/config';

async function testRealBroadcast() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const userId = '39e2a757-8104-4166-9504-9c8c5534f56f'; // analyzer user
  const analysisId = 'b61523ba-4a88-45d8-851e-4ddc843251f3'; // latest analysis

  console.log('Testing real broadcast with analyzer account...\n');

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-channel-broadcast`;

  console.log('Edge function URL:', edgeFunctionUrl);
  console.log('User ID:', userId);
  console.log('Analysis ID:', analysisId);

  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      userId: userId,
      analysisId: analysisId,
      eventType: 'new_analysis',
    }),
  });

  console.log('\nResponse status:', response.status);
  const text = await response.text();
  console.log('Response text:', text);

  try {
    const result = JSON.parse(text);
    console.log('Parsed result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON');
  }
}

testRealBroadcast().catch(console.error);
