import { config } from 'dotenv';
config();

async function testPDFPreview() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  console.log('Testing PDF Preview Generation...');
  console.log('Supabase URL:', supabaseUrl);
  console.log('Using service key:', serviceKey ? 'Yes' : 'No');

  const reportDate = new Date().toISOString().split('T')[0];
  console.log('Report date:', reportDate);

  try {
    const url = `${supabaseUrl}/functions/v1/generate-daily-pdf-report`;
    console.log('Calling:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: reportDate,
        previewOnly: true
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('Raw response length:', responseText.length);
    console.log('First 500 chars:', responseText.substring(0, 500));

    try {
      const result = JSON.parse(responseText);
      console.log('\n=== Parsed Response ===');
      console.log('Keys:', Object.keys(result));
      console.log('Has success:', 'success' in result);
      console.log('Has html:', 'html' in result);
      console.log('Has stats:', 'stats' in result);

      if (result.html) {
        console.log('HTML length:', result.html.length);
        console.log('HTML starts with:', result.html.substring(0, 100));
      } else {
        console.log('NO HTML FIELD!');
        console.log('Full result:', JSON.stringify(result, null, 2));
      }

      if (result.stats) {
        console.log('Stats:', result.stats);
      }
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      console.log('Response text:', responseText);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testPDFPreview();
