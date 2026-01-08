import 'dotenv/config';

async function updatePrices() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/indices-trade-tracker`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
  }

  try {
    console.log('🔄 Triggering price update...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Failed: ${response.status} - ${text}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ Update completed successfully:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updatePrices();
