import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJan30Trades() {
  console.log('Checking all trades for January 30, 2026...\n');

  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('*')
    .gte('created_at', '2026-01-30T00:00:00')
    .lt('created_at', '2026-01-31T00:00:00')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('No trades found for January 30, 2026');
    return;
  }

  console.log(`Found ${trades.length} trades:\n`);

  trades.forEach((trade, index) => {
    const profit = trade.final_profit_usd || trade.current_profit_usd || 0;
    const profitPercent = trade.final_profit_percent || trade.current_profit_percent || 0;
    const isLoss = profit < 0;

    console.log(`${index + 1}. Trade ID: ${trade.id}`);
    console.log(`   Strike: ${trade.strike_price}`);
    console.log(`   Type: ${trade.option_type}`);
    console.log(`   Entry: $${trade.entry_price}`);
    console.log(`   Current: $${trade.current_price || 'N/A'}`);
    console.log(`   High: $${trade.highest_price || 'N/A'}`);
    console.log(`   Status: ${trade.status}`);
    console.log(`   Expired: ${trade.expired_status || 'No'}`);
    console.log(`   Profit: $${profit.toFixed(2)} (${profitPercent.toFixed(1)}%)`);
    console.log(`   ${isLoss ? '❌ LOSS' : profit > 0 ? '✅ WIN' : '⚖️ BREAKEVEN'}`);
    console.log(`   Created: ${trade.created_at}`);
    console.log('');
  });

  const losses = trades.filter(t => (t.final_profit_usd || t.current_profit_usd || 0) < 0);
  const wins = trades.filter(t => (t.final_profit_usd || t.current_profit_usd || 0) > 0);
  const breakeven = trades.filter(t => (t.final_profit_usd || t.current_profit_usd || 0) === 0);

  console.log('\n=== Summary ===');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length}`);
  console.log(`Losses: ${losses.length}`);
  console.log(`Breakeven: ${breakeven.length}`);

  if (losses.length > 0) {
    console.log('\n=== LOSING TRADES ===');
    losses.forEach(trade => {
      console.log(`Strike ${trade.strike_price} ${trade.option_type}: $${trade.entry_price} → $${trade.current_price || 'N/A'} (Loss: $${(trade.final_profit_usd || trade.current_profit_usd || 0).toFixed(2)})`);
    });
  }
}

checkJan30Trades();
