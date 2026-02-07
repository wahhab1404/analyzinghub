import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceKey);

async function generateReportWithImage(startDate: string, endDate: string, periodType: string, label: string) {
  console.log(`\n=== Generating ${label} ===\n`);

  // Step 1: Generate report
  const generateResponse = await fetch(
    `${supabaseUrl}/functions/v1/generate-period-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        period_type: periodType,
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      })
    }
  );

  if (!generateResponse.ok) {
    console.error('❌ Report generation failed:', await generateResponse.text());
    return null;
  }

  const result = await generateResponse.json();
  console.log('✅ Report generated');
  console.log('   ID:', result.report_id);
  console.log('   Dates:', startDate, 'to', endDate);
  console.log('   Trades:', result.metrics.total_trades);
  console.log('   Net Profit: $' + result.metrics.net_profit);

  // Step 2: Generate image
  console.log('\n   Generating image...');

  const imageResponse = await fetch(
    `${supabaseUrl}/functions/v1/generate-report-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ report_id: result.report_id })
    }
  );

  if (!imageResponse.ok) {
    console.error('❌ Image generation failed');
    return result.report_id;
  }

  const imageBlob = await imageResponse.arrayBuffer();
  console.log('   ✅ Image generated:', imageBlob.byteLength, 'bytes');

  // Step 3: Upload image
  const fileName = `report-${result.report_id}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('daily-reports')
    .upload(fileName, imageBlob, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    return result.report_id;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('daily-reports')
    .getPublicUrl(fileName);

  console.log('   ✅ Image uploaded');

  // Step 4: Update report
  await supabase
    .from('daily_trade_reports')
    .update({ image_url: publicUrl })
    .eq('id', result.report_id);

  console.log('   ✅ Report updated with image URL');
  console.log('\n   📸 Image:', publicUrl);

  return result.report_id;
}

async function main() {
  console.log('=== Generating Fresh Reports with Images ===');

  // Generate This Week (Jan 26-30)
  await generateReportWithImage('2026-01-26', '2026-01-30', 'weekly', 'This Week Report');

  // Generate Last Week (Jan 19-23)
  await generateReportWithImage('2026-01-19', '2026-01-23', 'weekly', 'Last Week Report');

  // Generate This Month (January)
  await generateReportWithImage('2026-01-01', '2026-01-31', 'monthly', 'January Report');

  console.log('\n\n=== All Reports Generated Successfully! ===\n');
  console.log('You can now:');
  console.log('1. View reports in the dashboard at /dashboard/reports');
  console.log('2. Click Preview to see HTML with all trades');
  console.log('3. Click Image icon to see Telegram-ready image');
  console.log('4. Send reports to your Telegram channels\n');
}

main();
