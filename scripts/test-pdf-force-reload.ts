import { config } from 'dotenv';
config();

async function testPDFPreview() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  console.log('Testing PDF Preview with Cache Busting...');
  console.log('Supabase URL:', supabaseUrl);

  const reportDate = new Date().toISOString().split('T')[0];
  console.log('Report date:', reportDate);

  try {
    const url = `${supabaseUrl}/functions/v1/generate-daily-pdf-report?v=${Date.now()}`;
    console.log('Calling:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify({
        date: reportDate,
        previewOnly: true
      })
    });

    console.log('Response status:', response.status);

    const responseText = await response.text();
    console.log('Raw response:', responseText);

    try {
      const result = JSON.parse(responseText);
      console.log('\n=== Parsed Response ===');
      console.log('Keys:', Object.keys(result));

      if (result.debugInfo) {
        console.log('DEBUG INFO:', result.debugInfo);
      }

      if (result.html) {
        console.log('SUCCESS! HTML length:', result.html.length);
      } else {
        console.log('NO HTML FIELD!');
        console.log('Full result:', JSON.stringify(result, null, 2));
      }
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testPDFPreview();
