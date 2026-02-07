import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function generateAndSaveImage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const reportId = '1a6a83c3-3442-43ac-b2c2-831391f4671b';

  console.log('Step 1: Generating image...\n');

  const imageResponse = await fetch(
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

  if (!imageResponse.ok) {
    console.error('❌ Image generation failed:', await imageResponse.text());
    return;
  }

  const imageBlob = await imageResponse.arrayBuffer();
  console.log('✅ Image generated:', imageBlob.byteLength, 'bytes\n');

  console.log('Step 2: Uploading to storage...\n');

  const fileName = `report-${reportId}-${Date.now()}.png`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('daily-reports')
    .upload(fileName, imageBlob, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Upload error:', uploadError);
    return;
  }

  console.log('✅ Uploaded to storage:', uploadData.path, '\n');

  console.log('Step 3: Getting public URL...\n');

  const { data: { publicUrl } } = supabase.storage
    .from('daily-reports')
    .getPublicUrl(fileName);

  console.log('✅ Public URL:', publicUrl, '\n');

  console.log('Step 4: Updating report record...\n');

  const { error: updateError } = await supabase
    .from('daily_trade_reports')
    .update({ image_url: publicUrl })
    .eq('id', reportId);

  if (updateError) {
    console.error('❌ Update error:', updateError);
    return;
  }

  console.log('✅ Report updated with image URL\n');

  console.log('=== Success! ===');
  console.log('Image URL:', publicUrl);
}

generateAndSaveImage();
