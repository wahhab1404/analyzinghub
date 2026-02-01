import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function testWeeklyReport() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get the analyzer's ID (replace with actual ID)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role:roles(name)')
    .limit(1);

  if (!profiles || profiles.length === 0) {
    console.error('No profiles found');
    return;
  }

  const analyzerId = profiles[0].id;
  console.log('Testing for analyzer:', profiles[0].full_name, analyzerId);

  // Check all trades for this analyzer
  const { data: allTrades, error: tradesError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('author_id', analyzerId)
    .order('created_at', { ascending: false });

  if (tradesError) {
    console.error('Error fetching trades:', tradesError);
    return;
  }

  console.log('\nTotal trades:', allTrades?.length || 0);

  // Calculate current week dates
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  console.log('\nCurrent week range:');
  console.log('Monday:', monday.toISOString());
  console.log('Sunday:', sunday.toISOString());

  // Filter trades for current week
  const weekTrades = allTrades?.filter(t => {
    const createdAt = new Date(t.created_at);
    const closedAt = t.closed_at ? new Date(t.closed_at) : null;
    const expiryDate = t.expiry ? new Date(t.expiry) : null;

    const matchCreated = createdAt >= monday && createdAt <= sunday;
    const matchClosed = closedAt && closedAt >= monday && closedAt <= sunday;
    const matchExpiry = expiryDate && expiryDate >= monday && expiryDate <= sunday;
    const matchActive = t.status === 'active' && createdAt <= sunday;

    return matchCreated || matchClosed || matchExpiry || matchActive;
  }) || [];

  console.log('\nTrades in current week:', weekTrades.length);

  if (weekTrades.length > 0) {
    console.log('\nFirst 3 trades:');
    weekTrades.slice(0, 3).forEach((t, i) => {
      console.log(`\n${i + 1}. ${t.underlying_index_symbol} ${t.option_type} @ ${t.strike}`);
      console.log('   Created:', t.created_at);
      console.log('   Status:', t.status);
      console.log('   Entry:', t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last);
      console.log('   High:', t.contract_high_since);
    });
  }

  // Check existing reports
  console.log('\n--- Checking existing reports ---');
  const { data: reports, error: reportsError } = await supabase
    .from('daily_trade_reports')
    .select('*')
    .eq('author_id', analyzerId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (reportsError) {
    console.error('Error fetching reports:', reportsError);
    return;
  }

  console.log('\nTotal reports:', reports?.length || 0);
  if (reports && reports.length > 0) {
    console.log('\nLast 5 reports:');
    reports.slice(0, 5).forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.period_type?.toUpperCase() || 'DAILY'} - ${r.report_date}`);
      console.log('   Language:', r.language_mode);
      console.log('   Status:', r.status);
      console.log('   Trade count:', r.trade_count);
      console.log('   Start:', r.start_date);
      console.log('   End:', r.end_date);
      console.log('   Created:', r.created_at);
    });
  }

  // Try generating a weekly report
  console.log('\n--- Testing weekly report generation ---');
  const response = await fetch(`${supabaseUrl}/functions/v1/generate-period-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      start_date: monday.toISOString().split('T')[0],
      end_date: sunday.toISOString().split('T')[0],
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
    console.log('Metrics:', result.metrics);
  } else {
    console.error('\n✗ Report generation failed:', result);
  }
}

testWeeklyReport().catch(console.error);
