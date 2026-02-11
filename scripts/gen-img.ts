import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function genImage(tradeId: string) {
  console.log('Generating image for trade:', tradeId);
  
  const url = 'http://localhost:3000/api/indices/trades/' + tradeId + '/generate-image';
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Failed: ' + response.status);
  }
  
  const imageBuffer = await response.arrayBuffer();
  console.log('Image generated:', imageBuffer.byteLength, 'bytes');
  
  const now = new Date().getTime();
  const fileName = 'trade-snapshots/manual/' + tradeId + '-' + now + '.png';
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('chart-images')
    .upload(fileName, new Uint8Array(imageBuffer), {
      contentType: 'image/png',
      upsert: false,
    });
  
  if (uploadError) {
    throw new Error('Upload failed: ' + uploadError.message);
  }
  
  const { data: publicUrlData } = supabase.storage
    .from('chart-images')
    .getPublicUrl(uploadData.path);
  
  const publicUrl = publicUrlData.publicUrl;
  console.log('Public URL:', publicUrl);
  
  await supabase
    .from('index_trades')
    .update({ contract_url: publicUrl })
    .eq('id', tradeId);
  
  console.log('Trade updated with image URL');
  return publicUrl;
}

const tradeId = process.argv[2] || '0bf20ee3-cc1f-4035-94c7-4c63c24e24b6';
genImage(tradeId).catch(console.error);
