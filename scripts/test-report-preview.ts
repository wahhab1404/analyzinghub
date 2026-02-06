import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testReportPreview() {
  console.log('=== Testing Report Preview Data ===\n');

  // Generate a fresh report for this week
  console.log('Step 1: Generating report for Jan 26-30...\n');

  const generateResponse = await fetch(
    `${supabaseUrl}/functions/v1/generate-period-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        start_date: '2026-01-26',
        end_date: '2026-01-30',
        period_type: 'weekly',
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      }),
    }
  );

  if (!generateResponse.ok) {
    console.error('Failed to generate:', await generateResponse.text());
    return;
  }

  const report = await generateResponse.json();
  console.log('Report generated:');
  console.log('- ID:', report.report_id);
  console.log('- Trades:', report.metrics.total_trades);
  console.log('- HTML length:', report.html_preview?.length || 0);
  console.log('- Image URL:', report.image_url || 'none');

  // Now fetch the report to see what the API returns
  console.log('\n\nStep 2: Fetching report from database...\n');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl!, serviceRoleKey!);

  const { data: reportData, error } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('id', report.report_id)
    .single();

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log('Report from DB:');
  console.log('- Period:', reportData.start_date, 'to', reportData.end_date);
  console.log('- Trade count:', reportData.trade_count);
  console.log('- Summary:', reportData.summary);
  console.log('- HTML length:', reportData.html_content?.length || 0);
  console.log('- Image URL:', reportData.image_url || 'none');

  if (reportData.html_content) {
    console.log('\n--- HTML Preview (first 500 chars) ---');
    console.log(reportData.html_content.substring(0, 500));
  }
}

testReportPreview();
