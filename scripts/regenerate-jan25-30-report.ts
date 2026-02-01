import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function regenerateReport() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const analyzerId = '39e2a757-8104-4166-9504-9c8c5534f56f'; // Analyzer user
  const startDate = '2026-01-25';
  const endDate = '2026-01-30';

  console.log('Regenerating report for Jan 25-30');
  console.log('Analyzer ID:', analyzerId);

  // Check existing trades for that period
  const { data: allTrades } = await supabase
    .from('index_trades')
    .select('*')
    .eq('author_id', analyzerId);

  const start = new Date(startDate + 'T00:00:00.000Z');
  const end = new Date(endDate + 'T23:59:59.999Z');

  const weekTrades = allTrades?.filter(t => {
    const createdAt = new Date(t.created_at);
    const closedAt = t.closed_at ? new Date(t.closed_at) : null;
    const expiryDate = t.expiry ? new Date(t.expiry) : null;

    const matchCreated = createdAt >= start && createdAt <= end;
    const matchClosed = closedAt && closedAt >= start && closedAt <= end;
    const matchExpiry = expiryDate && expiryDate >= start && expiryDate <= end;
    const matchActive = t.status === 'active' && createdAt <= end;

    return matchCreated || matchClosed || matchExpiry || matchActive;
  }) || [];

  console.log(`\nFound ${weekTrades.length} trades for this period`);

  if (weekTrades.length > 0) {
    console.log('\nTrades:');
    weekTrades.forEach((t, i) => {
      console.log(`${i + 1}. ${t.underlying_index_symbol} ${t.option_type} @ ${t.strike}`);
      console.log('   ID:', t.id);
      console.log('   Created:', t.created_at);
      console.log('   Status:', t.status);
      console.log('   Entry:', t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last);
      console.log('   High:', t.contract_high_since);
      console.log('   PnL:', t.pnl_usd);
    });
  }

  // Delete existing report if any
  const { data: existingReport } = await supabase
    .from('daily_trade_reports')
    .select('id')
    .eq('author_id', analyzerId)
    .eq('period_type', 'weekly')
    .eq('report_date', endDate)
    .eq('language_mode', 'dual')
    .single();

  if (existingReport) {
    console.log(`\nDeleting existing report: ${existingReport.id}`);
    await supabase
      .from('daily_trade_reports')
      .delete()
      .eq('id', existingReport.id);
  }

  // Generate new report
  console.log('\n--- Generating weekly report ---');
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-period-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      start_date: startDate,
      end_date: endDate,
      analyst_id: analyzerId,
      language_mode: 'dual',
      period_type: 'weekly',
      dry_run: false
    })
  });

  const result = await response.json();

  if (response.ok) {
    console.log('\n✓ Report generated successfully!');
    console.log('Report ID:', result.report_id);
    console.log('\nMetrics:');
    console.log('Total Trades:', result.metrics.total_trades);
    console.log('Winning Trades:', result.metrics.winning_trades);
    console.log('Losing Trades:', result.metrics.losing_trades);
    console.log('Net Profit:', result.metrics.net_profit);
  } else {
    console.error('\n✗ Report generation failed:', result);
  }

  // Verify the new report
  const { data: newReport } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('id', result.report_id)
    .single();

  if (newReport) {
    console.log('\n--- Report Verification ---');
    console.log('Trade count in DB:', newReport.trade_count);
    console.log('Has HTML:', !!newReport.html_content);
    console.log('HTML length:', newReport.html_content?.length || 0);

    // Count actual trade cards in HTML
    const tradeCardCount = (newReport.html_content?.match(/class="trade-card"/g) || []).length;
    console.log('Trade cards in HTML:', tradeCardCount);

    const hasNoTrades = newReport.html_content?.includes('no-trades') || false;
    console.log('Contains "no-trades" div:', hasNoTrades);

    if (newReport.trade_count !== tradeCardCount) {
      console.error('\n⚠️  MISMATCH: trade_count in DB does not match trade cards in HTML!');
    } else {
      console.log('\n✓ Trade count matches HTML content');
    }
  }
}

regenerateReport().catch(console.error);
