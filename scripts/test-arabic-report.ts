import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testArabicReport() {
  console.log('Testing Arabic report generation...\n');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role:roles(name)')
    .eq('role.name', 'Analyzer')
    .limit(1)
    .single();

  if (!profile) {
    console.error('No analyzer found');
    return;
  }

  console.log(`Testing for analyzer: ${profile.id}\n`);

  const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-advanced-daily-report`;

  // Test all three language modes
  const modes = ['en', 'ar', 'dual'];

  for (const mode of modes) {
    console.log(`\n=== Testing ${mode} mode ===`);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        date: '2026-01-30',
        analyst_id: profile.id,
        language_mode: mode,
        period_type: 'daily',
        dry_run: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error for ${mode}:`, error);
      continue;
    }

    const result = await response.json();
    console.log(`Report generated: ${result.report_id}`);
    console.log(`File URL available: ${!!result.file_url}`);

    // Check the database entry
    const { data: report } = await supabase
      .from('daily_trade_reports')
      .select('id, language_mode, html_content')
      .eq('id', result.report_id)
      .single();

    if (report) {
      console.log(`Language mode in DB: ${report.language_mode}`);

      // Check if HTML contains Arabic
      const hasArabic = /[\u0600-\u06FF]/.test(report.html_content);
      console.log(`Contains Arabic text: ${hasArabic}`);

      // Check for specific Arabic translations
      const hasNetProfit = report.html_content.includes('صافي الربح');
      const hasWinRate = report.html_content.includes('معدل النجاح');
      const hasTotalLoss = report.html_content.includes('إجمالي الخسارة');

      console.log(`Contains "صافي الربح" (Net Profit): ${hasNetProfit}`);
      console.log(`Contains "معدل النجاح" (Win Rate): ${hasWinRate}`);
      console.log(`Contains "إجمالي الخسارة" (Total Loss): ${hasTotalLoss}`);

      if (mode === 'ar' || mode === 'dual') {
        if (!hasArabic) {
          console.error('❌ ERROR: Arabic mode but no Arabic text found!');
        } else if (!hasNetProfit || !hasWinRate || !hasTotalLoss) {
          console.error('❌ ERROR: Some Arabic translations missing!');
        } else {
          console.log('✓ All Arabic translations present');
        }
      }
    }
  }

  console.log('\n=== Test Complete ===');
}

testArabicReport();
