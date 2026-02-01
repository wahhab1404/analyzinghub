import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkReportHTML() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get the latest weekly report for Analyzer
  const { data: report } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('author_id', '39e2a757-8104-4166-9504-9c8c5534f56f')
    .eq('period_type', 'weekly')
    .eq('report_date', '2026-01-30')
    .eq('language_mode', 'dual')
    .single();

  if (!report) {
    console.log('Report not found');
    return;
  }

  console.log('Report ID:', report.id);
  console.log('Trade count:', report.trade_count);
  console.log('Period:', report.start_date, 'to', report.end_date);

  if (report.html_content) {
    // Count trade cards
    const tradeCardMatches = report.html_content.match(/<div class="trade-card">/g);
    const tradeCardCount = tradeCardMatches ? tradeCardMatches.length : 0;
    console.log('\nTrade cards found:', tradeCardCount);

    // Check for the no-trades message DIV (not just the CSS class)
    const noTradesDiv = report.html_content.includes('<div class="no-trades">');
    console.log('Has no-trades DIV element:', noTradesDiv);

    // Check for the specific no-trades message text
    const noTradesText = report.html_content.includes('No trades recorded') ||
                         report.html_content.includes('لا توجد صفقات مسجلة');
    console.log('Has no-trades message text:', noTradesText);

    // Extract a sample of the trades section
    const tradesSection = report.html_content.match(/<div class="trades-section">[\s\S]*?<\/div>\s*<div class="footer">/);

    if (tradesSection) {
      const section = tradesSection[0];
      console.log('\n--- Trades Section Analysis ---');
      console.log('Section length:', section.length);

      // Check what's in the section
      if (section.includes('<div class="no-trades">')) {
        console.log('✗ PROBLEM: Contains no-trades div');

        // Extract the no-trades div
        const noTradesMatch = section.match(/<div class="no-trades">.*?<\/div>/s);
        if (noTradesMatch) {
          console.log('\nNo-trades div content:');
          console.log(noTradesMatch[0].substring(0, 200));
        }
      }

      if (section.includes('<div class="trade-card">')) {
        console.log('✓ Contains trade cards');
      }

      // Show first 500 characters of trades section
      console.log('\nFirst 500 chars of trades section:');
      console.log(section.substring(0, 500));
    }
  }
}

checkReportHTML().catch(console.error);
