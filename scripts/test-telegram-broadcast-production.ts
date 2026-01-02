import 'dotenv/config';

async function testTelegramBroadcast() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-channel-broadcast`;

  const payload = {
    userId: '39e2a757-8104-4166-9504-9c8c5534f56f',
    analysisId: 'f3f01c37-1f0f-4cdb-97ea-5c8aba4d2753',
    channelId: '-1003604758634',
    eventType: 'new_analysis',
    symbol: 'AAPL',
    direction: 'Long',
    entryPrice: 150.00,
  };

  console.log('Testing Telegram Broadcast...');
  console.log('Edge Function URL:', edgeFunctionUrl);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('Response Status:', response.status);
    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log('\n✅ Telegram broadcast test SUCCESSFUL!');
    } else {
      console.log('\n❌ Telegram broadcast test FAILED');
      console.log('Error:', result.error);
      console.log('Details:', result.details);
    }
  } catch (error: any) {
    console.error('❌ Error testing broadcast:', error.message);
  }
}

testTelegramBroadcast();
