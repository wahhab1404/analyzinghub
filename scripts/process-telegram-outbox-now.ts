import 'dotenv/config';

async function processOutbox() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-outbox-processor`;

  console.log('Manually triggering telegram outbox processor...');
  console.log('URL:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    console.log('Status:', response.status);
    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.processed > 0) {
      console.log(`\n✅ Processed ${result.processed} messages!`);
    } else {
      console.log('\n⚠️  No messages were processed');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

processOutbox().catch(console.error);
