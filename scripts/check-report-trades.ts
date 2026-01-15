import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

async function checkReportTrades() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the latest report
  const { data: report } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('📊 Latest Report:');
  console.log('- ID:', report?.id);
  console.log('- Date:', report?.report_date);
  console.log('- Trade Count:', report?.trade_count);
  console.log('- Author:', report?.author_id);
  console.log('- Summary:', JSON.stringify(report?.summary, null, 2));

  // Check for trades on that date
  const reportDate = report?.report_date;
  const authorId = report?.author_id;

  if (reportDate && authorId) {
    const startOfDay = new Date(reportDate + 'T00:00:00.000Z');
    const endOfDay = new Date(reportDate + 'T23:59:59.999Z');

    console.log('\n🔍 Checking trades for:');
    console.log('- Date:', reportDate);
    console.log('- Start:', startOfDay.toISOString());
    console.log('- End:', endOfDay.toISOString());

    const { data: trades, error } = await supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', authorId)
      .or(`created_at.gte.${startOfDay.toISOString()},closed_at.eq.${reportDate},expiry.eq.${reportDate}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('\n❌ Trades query error:', error);
    }

    console.log('\n📈 Trades found:', trades?.length || 0);

    if (trades && trades.length > 0) {
      console.log('\n📋 Trade Details:');
      trades.forEach((trade, i) => {
        console.log(`\n${i + 1}. ${trade.underlying_index_symbol}`);
        console.log('   Status:', trade.status);
        console.log('   Created:', trade.created_at);
        console.log('   Entry:', trade.entry_contract_snapshot);
        console.log('   Current:', trade.current_contract);
        console.log('   High:', trade.contract_high_since);
      });
    } else {
      console.log('\n⚠️  No trades found for this date and analyst');

      // Check if ANY trades exist for this analyst
      const { data: allTrades, count } = await supabase
        .from('index_trades')
        .select('id, underlying_index_symbol, created_at', { count: 'exact' })
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .limit(5);

      console.log(`\n📊 Total trades by this analyst: ${count}`);
      if (allTrades && allTrades.length > 0) {
        console.log('\nMost recent trades:');
        allTrades.forEach(t => {
          console.log(`- ${t.underlying_index_symbol} at ${t.created_at}`);
        });
      }
    }
  }
}

checkReportTrades().catch(console.error);
