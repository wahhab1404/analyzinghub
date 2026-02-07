import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function checkAllTrades() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get all trades
  const { data: allTrades, error: tradesError } = await supabase
    .from('index_trades')
    .select('*, author:profiles!author_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (tradesError) {
    console.error('Error fetching trades:', tradesError);
    return;
  }

  console.log('Total trades in system:', allTrades?.length || 0);

  if (allTrades && allTrades.length > 0) {
    console.log('\nRecent trades:');
    allTrades.forEach((t, i) => {
      console.log(`\n${i + 1}. ${t.underlying_index_symbol} ${t.option_type} @ ${t.strike}`);
      console.log('   Author:', (t.author as any)?.full_name || t.author_id);
      console.log('   Created:', t.created_at);
      console.log('   Status:', t.status);
      console.log('   Entry:', t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last);
      console.log('   High:', t.contract_high_since);
    });
  }

  // Get all reports
  const { data: allReports, error: reportsError } = await supabase
    .from('daily_trade_reports')
    .select('*, author:profiles!author_id(full_name)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (reportsError) {
    console.error('Error fetching reports:', reportsError);
    return;
  }

  console.log('\n\nTotal reports in system:', allReports?.length || 0);

  if (allReports && allReports.length > 0) {
    console.log('\nRecent reports:');
    allReports.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.period_type?.toUpperCase() || 'DAILY'} - ${r.report_date}`);
      console.log('   Author:', (r.author as any)?.full_name || r.author_id);
      console.log('   Language:', r.language_mode);
      console.log('   Status:', r.status);
      console.log('   Trade count:', r.trade_count);
      console.log('   Start:', r.start_date);
      console.log('   End:', r.end_date);
      console.log('   Created:', r.created_at);
      console.log('   Has HTML:', !!r.html_content);
    });
  }

  // Get all analyzers
  const { data: analyzers } = await supabase
    .from('profiles')
    .select('id, full_name, role:roles(name)')
    .order('created_at', { ascending: false });

  console.log('\n\nAll users:');
  analyzers?.forEach((a, i) => {
    console.log(`${i + 1}. ${a.full_name} (${(a.role as any)?.name || 'No Role'}) - ${a.id}`);
  });
}

checkAllTrades().catch(console.error);
