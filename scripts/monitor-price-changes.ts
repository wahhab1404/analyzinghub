import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function monitorPriceChanges() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('Fetching active trades to monitor...\n');

  // Get snapshot of current prices
  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, current_contract, last_quote_at, status')
    .eq('status', 'active')
    .order('last_quote_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching trades:', error);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('No active trades found');
    return;
  }

  console.log('Current prices (before update):');
  console.log('='.repeat(80));
  trades.forEach((trade: any) => {
    const lastUpdate = new Date(trade.last_quote_at);
    const minutesAgo = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);
    console.log(`Trade: ${trade.id.substring(0, 8)}`);
    console.log(`  Ticker: ${trade.polygon_option_ticker || 'N/A'}`);
    console.log(`  Price: $${trade.current_contract}`);
    console.log(`  Last updated: ${minutesAgo}m ago (${lastUpdate.toLocaleTimeString()})`);
    console.log('');
  });

  // Trigger price update
  console.log('\n' + '='.repeat(80));
  console.log('Triggering price update...');
  console.log('='.repeat(80) + '\n');

  const updateResponse = await fetch(`${supabaseUrl}/functions/v1/indices-trade-tracker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const updateResult = await updateResponse.json();
  console.log('Update result:', JSON.stringify(updateResult, null, 2));

  // Wait a moment for updates to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get updated prices
  const { data: updatedTrades, error: updateError } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, current_contract, last_quote_at, status')
    .in('id', trades.map((t: any) => t.id));

  if (updateError) {
    console.error('Error fetching updated trades:', updateError);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('Prices after update:');
  console.log('='.repeat(80));

  let changedCount = 0;
  let unchangedCount = 0;

  updatedTrades?.forEach((updated: any) => {
    const original = trades.find((t: any) => t.id === updated.id);
    const priceChanged = original && original.current_contract !== updated.current_contract;
    const lastUpdate = new Date(updated.last_quote_at);
    const minutesAgo = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);

    if (priceChanged) {
      changedCount++;
      const change = updated.current_contract - original.current_contract;
      const changePercent = (change / original.current_contract) * 100;
      console.log(`Trade: ${updated.id.substring(0, 8)} ✅ CHANGED`);
      console.log(`  Ticker: ${updated.polygon_option_ticker || 'N/A'}`);
      console.log(`  Old Price: $${original.current_contract}`);
      console.log(`  New Price: $${updated.current_contract}`);
      console.log(`  Change: ${change > 0 ? '+' : ''}$${change.toFixed(4)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
      console.log(`  Last updated: ${minutesAgo}m ago (${lastUpdate.toLocaleTimeString()})`);
    } else {
      unchangedCount++;
      console.log(`Trade: ${updated.id.substring(0, 8)} ⚪ UNCHANGED`);
      console.log(`  Ticker: ${updated.polygon_option_ticker || 'N/A'}`);
      console.log(`  Price: $${updated.current_contract}`);
      console.log(`  Last updated: ${minutesAgo}m ago (${lastUpdate.toLocaleTimeString()})`);
    }
    console.log('');
  });

  console.log('='.repeat(80));
  console.log(`Summary: ${changedCount} changed, ${unchangedCount} unchanged`);
  console.log('='.repeat(80));

  if (unchangedCount > 0) {
    console.log('\n⚠️  Note: Prices may not change if:');
    console.log('   - Markets are closed (outside trading hours)');
    console.log('   - No new trades occurred for these contracts');
    console.log('   - Polygon API is returning cached/stale data');
    console.log('   - Contracts have low liquidity');

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isMarketHours = hour >= 9 && hour < 16; // Rough market hours (9:30 AM - 4:00 PM ET)

    if (isWeekend) {
      console.log('\n🔴 Markets are CLOSED (Weekend)');
    } else if (!isMarketHours) {
      console.log('\n🟡 Markets are likely CLOSED (Outside trading hours)');
    } else {
      console.log('\n🟢 Markets should be OPEN');
    }
  }
}

monitorPriceChanges();
