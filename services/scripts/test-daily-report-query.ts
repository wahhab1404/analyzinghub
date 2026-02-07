import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const reportDate = '2026-01-30';
  const startOfDay = new Date(reportDate + 'T00:00:00.000Z');
  const endOfDay = new Date(reportDate + 'T23:59:59.999Z');

  console.log('Testing daily report query for:', reportDate);
  console.log('Start:', startOfDay.toISOString());
  console.log('End:', endOfDay.toISOString());
  console.log('');

  // Get all trades without author filter to see what's there
  const { data: allTrades, error: allError } = await supabase
    .from('index_trades')
    .select('id, strike, option_type, status, created_at, published_at, closed_at, expiry, contract_high_since')
    .eq('underlying_index_symbol', 'SPX')
    .gte('published_at', startOfDay.toISOString())
    .lte('published_at', endOfDay.toISOString())
    .order('published_at', { ascending: true });

  if (allError) {
    console.error('Error:', allError);
    return;
  }

  console.log(`Found ${allTrades?.length || 0} trades published today\n`);

  if (allTrades && allTrades.length > 0) {
    allTrades.forEach(t => {
      console.log(`Strike ${t.strike} ${t.option_type}:`);
      console.log(`  Status: ${t.status}`);
      console.log(`  Created: ${t.created_at}`);
      console.log(`  Published: ${t.published_at}`);
      console.log(`  Closed: ${t.closed_at || 'N/A'}`);
      console.log(`  Expiry: ${t.expiry || 'N/A'}`);
      console.log(`  High: ${t.contract_high_since || 'N/A'}`);
      console.log('');
    });
  }

  // Now test the query that the daily report uses
  console.log('\n--- Testing the daily report query logic ---\n');

  const { data: trades, error: tradesError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('underlying_index_symbol', 'SPX')
    .or(`created_at.lte.${endOfDay.toISOString()},closed_at.gte.${startOfDay.toISOString()},expiry.gte.${startOfDay.toISOString()}`)
    .order('created_at', { ascending: false });

  if (tradesError) {
    console.error('Error:', tradesError);
    return;
  }

  console.log(`Query returned ${trades?.length || 0} trades\n`);

  const activeTrades = trades?.filter(t => {
    const createdAt = new Date(t.created_at);
    return t.status === 'active' &&
      createdAt >= startOfDay &&
      createdAt <= endOfDay;
  }) || [];

  const closedTrades = trades?.filter(t => {
    if (!t.closed_at) return false;
    const closedAt = new Date(t.closed_at);
    return t.status === 'closed' &&
      closedAt >= startOfDay &&
      closedAt <= endOfDay;
  }) || [];

  const expiredTrades = trades?.filter(t => {
    if (!t.expiry) return false;
    const expiryDate = new Date(t.expiry);
    return expiryDate >= startOfDay &&
      expiryDate <= endOfDay;
  }) || [];

  console.log('After filtering:');
  console.log(`  Active trades (created today): ${activeTrades.length}`);
  console.log(`  Closed trades (closed today): ${closedTrades.length}`);
  console.log(`  Expired trades (expiring today): ${expiredTrades.length}`);
  console.log(`  Total: ${activeTrades.length + closedTrades.length + expiredTrades.length}`);
}

main();
