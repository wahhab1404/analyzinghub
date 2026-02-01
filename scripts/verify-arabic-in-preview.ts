import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyArabicInPreview() {
  console.log('Verifying Arabic content in report previews...\n');

  const { data: reports } = await supabase
    .from('daily_trade_reports')
    .select('id, report_date, language_mode, html_content')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!reports || reports.length === 0) {
    console.log('No reports found');
    return;
  }

  console.log(`Found ${reports.length} recent reports:\n`);

  reports.forEach((report, index) => {
    console.log(`${index + 1}. Report ID: ${report.id}`);
    console.log(`   Date: ${report.report_date}`);
    console.log(`   Language: ${report.language_mode}`);
    console.log(`   Has HTML Content: ${!!report.html_content}`);

    if (report.html_content) {
      const hasArabic = /[\u0600-\u06FF]/.test(report.html_content);
      const hasNetProfit = report.html_content.includes('صافي الربح');
      const hasWinRate = report.html_content.includes('معدل النجاح');
      const hasTotalLoss = report.html_content.includes('إجمالي الخسارة');
      const hasCall = report.html_content.includes('شراء');
      const hasPut = report.html_content.includes('بيع');

      console.log(`   Contains Arabic: ${hasArabic}`);

      if (report.language_mode === 'ar' || report.language_mode === 'dual') {
        console.log(`   Arabic Translations:`);
        console.log(`     - Net Profit (صافي الربح): ${hasNetProfit ? '✓' : '✗'}`);
        console.log(`     - Win Rate (معدل النجاح): ${hasWinRate ? '✓' : '✗'}`);
        console.log(`     - Total Loss (إجمالي الخسارة): ${hasTotalLoss ? '✓' : '✗'}`);
        console.log(`     - CALL (شراء): ${hasCall ? '✓' : '✗'}`);
        console.log(`     - PUT (بيع): ${hasPut ? '✓' : '✗'}`);

        if (hasArabic && hasNetProfit && hasWinRate && hasTotalLoss) {
          console.log(`   Status: ✓ COMPLETE - All Arabic translations present`);
        } else {
          console.log(`   Status: ✗ INCOMPLETE - Some translations missing`);
        }
      }
    } else {
      console.log(`   Status: ✗ NO HTML CONTENT`);
    }
    console.log('');
  });
}

verifyArabicInPreview();
