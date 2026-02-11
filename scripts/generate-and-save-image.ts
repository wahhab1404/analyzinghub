import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateAndSaveImage(tradeId: string) {
  console.log(`Generating image for trade ${tradeId}...`);

  const localUrl = `http://localhost:3000/api/indices/trades/${tradeId}/generate-image`;

  try {
    const response = await fetch(localUrl);

    if (!response.ok) {
      throw new Error(`Failed to generate image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    console.log(`✅ Image generated successfully (${imageBuffer.byteLength} bytes)`);

    const fileName = `trade-snapshots/manual/${tradeId}-${Date.now()}.png`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chart-images')
      .upload(fileName, new Uint8Array(imageBuffer), {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    console.log(`✅ Image uploaded to: ${fileName}`);

    const { data: publicUrlData } = supabase.storage
      .from('chart-images')
      .getPublicUrl(uploadData.path);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`✅ Public URL: ${publicUrl}`);

    const { error: updateError } = await supabase
      .from('index_trades')
      .update({ contract_url: publicUrl })
      .eq('id', tradeId);

    if (updateError) {
      throw new Error(`Failed to update trade: ${updateError.message}`);
    }

    console.log(`✅ Trade ${tradeId} updated with image URL`);

    return publicUrl;
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

const tradeIds = process.argv.slice(2);

if (tradeIds.length === 0) {
  console.log('Usage: tsx scripts/generate-and-save-image.ts <trade-id> [trade-id...]');
  console.log('\nRecent test trades:');
  console.log('  0bf20ee3-cc1f-4035-94c7-4c63c24e24b6');
  console.log('  5758a3e3-48f6-45f9-95d7-0ebfd33d3fe9');
  process.exit(1);
}

(async () => {
  for (const tradeId of tradeIds) {
    console.log('\n' + '='.repeat(80));
    try {
      await generateAndSaveImage(tradeId);
    } catch (error) {
      console.error(`Failed to process trade ${tradeId}`);
    }
  }
})();
