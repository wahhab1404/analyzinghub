import 'dotenv/config';
import { writeFileSync } from 'fs';

async function testImageEndpoint() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reportId = '1a6a83c3-3442-43ac-b2c2-831391f4671b';

  console.log('Testing image generation endpoint...');
  console.log('Report ID:', reportId);
  console.log('URL:', `${supabaseUrl}/functions/v1/generate-report-image`);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-report-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({ report_id: reportId })
      }
    );

    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }

    const buffer = await response.arrayBuffer();
    console.log('✅ Image generated!');
    console.log('   Size:', buffer.byteLength, 'bytes');

    // Save to file for inspection
    writeFileSync('/tmp/test-report-image.png', Buffer.from(buffer));
    console.log('   Saved to: /tmp/test-report-image.png');

  } catch (error) {
    console.error('Error:', error);
  }
}

testImageEndpoint();
