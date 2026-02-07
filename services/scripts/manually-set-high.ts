import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function setHighPrice() {
  console.log('=== Manually Setting High Price ===\n');

  const { data: trade } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active')
    .single();

  if (!trade) {
    console.log('No active trade found');
    return;
  }

  console.log('Trade:', trade.polygon_option_ticker);
  console.log('Current High:', trade.contract_high_since || 'none');
  console.log('');

  const newHigh = 8.20;
  console.log('Setting high to:', newHigh);

  const { data, error } = await supabase
    .from('index_trades')
    .update({
      contract_high_since: newHigh,
      max_profit: newHigh,
    })
    .eq('id', trade.id)
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ High price updated!');
  console.log('');
  console.log('Now run the trade tracker to see if new highs are detected:');
  console.log('npx tsx scripts/diagnose-trade-updates.ts');
}

setHighPrice().catch(console.error);
