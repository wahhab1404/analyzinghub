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
    .select('id, strike, option_type, entry_contract_snapshot, contract_high_since, published_at, created_at')
    .gte('published_at', today)
    .eq('underlying_index_symbol', 'SPX')
    .order('published_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Today\'s trades:');
    if (data.length === 0) {
      console.log('No trades found for today');
    } else {
      data.forEach(t => {
        const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
        console.log(`- Strike ${t.strike} ${t.option_type}: Entry ${entryPrice}, High ${t.contract_high_since || 'N/A'}`);
        console.log(`  ID: ${t.id}`);
        console.log(`  Published: ${t.published_at}`);
      });
    }
  }
}

main();
