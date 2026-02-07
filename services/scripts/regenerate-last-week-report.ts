import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function regenerateLastWeekReport() {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get the analyzer (change this to your actual analyzer ID)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role:roles(name)')
    .eq('id', '39e2a757-8104-4166-9504-9c8c5534f56f') // Analyzer user
    .single();

  if (!profiles) {
    console.error('Profile not found');
    return;
  }

  const analyzerId = profiles.id;
  console.log('Regenerating report for:', profiles.full_name, analyzerId);

  // Calculate last week dates (Mon-Sun)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Go back to last week's Monday
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diff - 7);
  lastMonday.setHours(0, 0, 0, 0);

  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  const startDate = lastMonday.toISOString().split('T')[0];
  const endDate = lastSunday.toISOString().split('T')[0];

  console.log('\nLast week range:');
  console.log('Monday:', startDate);
  console.log('Sunday:', endDate);

  // Check existing trades for that period
  const { data: allTrades } = await supabase
    .from('index_trades')
    .select('*')
    .eq('author_id', analyzerId);

  const weekTrades = allTrades?.filter(t => {
    const createdAt = new Date(t.created_at);
    const closedAt = t.closed_at ? new Date(t.closed_at) : null;
    const expiryDate = t.expiry ? new Date(t.expiry) : null;

    const matchCreated = createdAt >= lastMonday && createdAt <= lastSunday;
    const matchClosed = closedAt && closedAt >= lastMonday && closedAt <= lastSunday;
    const matchExpiry = expiryDate && expiryDate >= lastMonday && expiryDate <= lastSunday;
    const matchActive = t.status === 'active' && createdAt <= lastSunday;

    return matchCreated || matchClosed || matchExpiry || matchActive;
  }) || [];

  console.log(`\nFound ${weekTrades.length} trades for last week`);

  if (weekTrades.length > 0) {
    console.log('\nTrades:');
    weekTrades.forEach((t, i) => {
      console.log(`${i + 1}. ${t.underlying_index_symbol} ${t.option_type} @ ${t.strike}`);
      console.log('   Created:', t.created_at);
      console.log('   Status:', t.status);
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
  console.log('\n--- Regenerating weekly report ---');
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
    console.log('\n✓ Report regenerated successfully!');
    console.log('Report ID:', result.report_id);
    console.log('Metrics:', JSON.stringify(result.metrics, null, 2));
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
    console.log('\n--- Report Details ---');
    console.log('Trade count:', newReport.trade_count);
    console.log('Has HTML:', !!newReport.html_content);
    console.log('HTML length:', newReport.html_content?.length || 0);
    console.log('Contains "no-trades":', newReport.html_content?.includes('no-trades') || false);

    // Count actual trade cards in HTML
    const tradeCardCount = (newReport.html_content?.match(/class="trade-card"/g) || []).length;
    console.log('Trade cards in HTML:', tradeCardCount);
  }
}

regenerateLastWeekReport().catch(console.error);
