import 'dotenv/config';

async function testPriceUpdate() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const url = `${supabaseUrl}/functions/v1/indices-trade-tracker`;

  console.log('Triggering price update...');
  console.log('URL:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    console.log('\nResponse:', JSON.stringify(data, null, 2));

    if (data.ok) {
      console.log(`\n✅ Price update successful!`);
      console.log(`   - Processed: ${data.processed} trades`);
      console.log(`   - Updated: ${data.updated} trades`);
      console.log(`   - Wins detected: ${data.winDetected}`);
      console.log(`   - Losses detected: ${data.lossDetected}`);
      console.log(`   - Errors: ${data.errors}`);
      console.log(`   - Duration: ${data.duration}ms`);
    } else {
      console.log(`\n❌ Price update failed: ${data.error}`);
    }
  } catch (error: any) {
    console.error('Error triggering price update:', error.message);
  }
}

testPriceUpdate();
