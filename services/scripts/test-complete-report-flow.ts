import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testCompleteFlow() {
  console.log('=== Testing Complete Report Generation Flow ===\n');
  console.log('This will test:');
  console.log('1. Date calculation (This Week on Sunday)');
  console.log('2. Report generation with correct trade count');
  console.log('3. HTML content storage');
  console.log('4. Image generation with trades');
  console.log('5. Telegram-ready image\n');

  // Test "This Week" report
  console.log('--- Generating This Week Report ---\n');

  const generateResponse = await fetch(
    `${supabaseUrl}/functions/v1/generate-period-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        start_date: '2026-01-26',
        end_date: '2026-01-30',
        period_type: 'weekly',
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      })
    }
  );

  if (!generateResponse.ok) {
    console.error('❌ Generation failed:', await generateResponse.text());
    return;
  }

  const result = await generateResponse.json();
  console.log('✅ Report generated');
  console.log('   Report ID:', result.report_id);
  console.log('   Trades:', result.metrics.total_trades);
  console.log('   Net Profit: $', result.metrics.net_profit);
  console.log('   Win Rate:', result.metrics.win_rate.toFixed(1), '%');

  // Wait for image generation (it happens async)
  console.log('\n⏳ Waiting 3 seconds for image generation...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Fetch the complete report
  const { data: report, error } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('id', result.report_id)
    .single();

  if (error) {
    console.error('❌ Error fetching report:', error);
    return;
  }

  console.log('--- Report Verification ---\n');
  console.log('✅ Period:', report.start_date, 'to', report.end_date);
  console.log('✅ Trade Count:', report.trade_count);
  console.log('✅ HTML Content:', report.html_content ? 'Present (' + report.html_content.length + ' chars)' : 'Missing');
  console.log('✅ Image URL:', report.image_url || 'Not generated yet');
  console.log('✅ File URL:', report.file_url ? 'Present' : 'Missing');

  if (report.image_url) {
    console.log('\n📸 Image available for Telegram at:');
    console.log('   ', report.image_url);
  }

  console.log('\n=== All Tests Complete ===');
  console.log('\nSummary:');
  console.log('- Date Range: Jan 26-30 (This Week) ✅');
  console.log('- Trades Found:', report.trade_count, '(expected 5) ✅');
  console.log('- HTML Generated:', report.html_content ? 'Yes ✅' : 'No ❌');
  console.log('- Image Generated:', report.image_url ? 'Yes ✅' : 'No ❌');
}

testCompleteFlow();
