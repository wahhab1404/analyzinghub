import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const today = '2026-01-30';
  const { data, error } = await supabase
    .from('index_trades')
    .select('strike, option_type, entry_contract_snapshot, contract_high_since, pnl_usd, final_profit, max_profit, is_winning_trade')
    .gte('published_at', today)
    .lte('published_at', today + 'T23:59:59')
    .eq('underlying_index_symbol', 'SPX')
    .order('strike', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('All today\'s trades with profit details:\n');

  let totalProfit = 0;

  data.forEach(t => {
    const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
    const profit = t.pnl_usd || t.final_profit || t.max_profit || 0;
    totalProfit += profit;

    console.log(`Strike ${t.strike} ${t.option_type}:`);
    console.log(`  Entry: $${entryPrice}`);
    console.log(`  High: $${t.contract_high_since}`);
    console.log(`  Profit (PnL): $${profit}`);
    console.log(`  Is Winner: ${t.is_winning_trade}`);
    console.log('');
  });

  console.log(`Total Profit: $${totalProfit.toFixed(2)}`);
}

main();
