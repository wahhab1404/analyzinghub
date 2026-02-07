import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testImageGeneration() {
  console.log('=== Testing Complete Report Generation with Image ===\n');

  // Use an existing report
  const reportId = 'e8b609f1-af7f-448f-8ef1-186a4a593475'; // This Week report

  console.log('Step 1: Calling image generation for report:', reportId);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-report-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({ report_id: reportId })
      }
    );

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error:', errorText);
      return;
    }

    const imageBuffer = await response.arrayBuffer();
    console.log('\n✅ Image generated successfully!');
    console.log('Image size:', imageBuffer.byteLength, 'bytes');
    console.log('Image type: PNG');

    // Now check if it's in the database
    console.log('\nStep 2: Checking database for image_url...\n');

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!);

    const { data, error } = await supabase
      .from('daily_trade_reports')
      .select('id, image_url')
      .eq('id', reportId)
      .single();

    if (error) {
      console.error('Database error:', error);
      return;
    }

    if (data?.image_url) {
      console.log('✅ Image URL saved in database:', data.image_url);
    } else {
      console.log('❌ No image_url in database');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testImageGeneration();
