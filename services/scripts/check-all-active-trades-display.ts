import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllActiveTrades() {
  console.log('📊 Checking ALL active trades in system...\n');

  const { data: trades, error } = await supabase
    .from('index_trades')
    .select(`
      *,
      author:profiles!author_id(id, full_name)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching trades:', error);
    return;
  }

  console.log(`Found ${trades.length} active trades:\n`);

  for (const trade of trades) {
    const entryMid = trade.entry_contract_snapshot?.mid || 0;
    const entryLast = trade.entry_contract_snapshot?.last || 0;
    const entryPrice = entryMid || entryLast;

    console.log(`\n📊 Trade ${trade.id.substring(0, 8)}... (Author: ${trade.author?.full_name || 'Unknown'})`);
    console.log(`   Symbol: ${trade.underlying_index_symbol} ${trade.strike} ${trade.option_type?.toUpperCase()}`);
    console.log(`   Entry (mid): $${entryMid.toFixed(4)}`);
    console.log(`   Entry (last): $${entryLast.toFixed(4)}`);
    console.log(`   Current: $${trade.current_contract || 0}`);
    console.log(`   contract_high_since: $${trade.contract_high_since || 0}`);
    console.log(`   max_contract_price: $${trade.max_contract_price || 0}`);
    console.log(`   max_profit: $${trade.max_profit || 0}`);

    if (trade.contract_high_since < entryPrice) {
      console.log(`   ⚠️  HIGH IS LESS THAN ENTRY! This is wrong!`);
    }
    if (trade.current_contract && trade.contract_high_since < trade.current_contract) {
      console.log(`   ⚠️  HIGH IS LESS THAN CURRENT! This is wrong!`);
    }
  }
}

checkAllActiveTrades().catch(console.error);
