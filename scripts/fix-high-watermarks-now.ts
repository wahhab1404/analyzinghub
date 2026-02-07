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

async function fixHighWatermarks() {
  console.log('🔧 Fixing high watermarks for active trades...\n');

  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active')
    .not('polygon_option_ticker', 'is', null);

  if (error) {
    console.error('Error fetching trades:', error);
    return;
  }

  console.log(`Found ${trades.length} active trades\n`);

  for (const trade of trades) {
    console.log(`\n📊 Trade ${trade.id}:`);
    console.log(`  Symbol: ${trade.underlying_index_symbol} ${trade.strike} ${trade.option_type}`);
    console.log(`  Entry: $${trade.entry_contract_snapshot?.mid || 0}`);
    console.log(`  Current: $${trade.current_contract || 0}`);
    console.log(`  Old High (contract_high_since): $${trade.contract_high_since || 0}`);
    console.log(`  Old High (max_contract_price): $${trade.max_contract_price || 0}`);

    const currentPrice = trade.current_contract || 0;
    if (currentPrice === 0) {
      console.log('  ⚠️  No current price, skipping');
      continue;
    }

    console.log(`\n  🔄 Updating high watermark with current price: $${currentPrice}`);

    const { data: result, error: updateError } = await supabase.rpc(
      'update_trade_high_watermark',
      {
        p_trade_id: trade.id,
        p_current_price: currentPrice
      }
    );

    if (updateError) {
      console.error('  ❌ Error:', updateError);
      continue;
    }

    console.log('  ✅ Result:', result);

    const { data: updatedTrade } = await supabase
      .from('index_trades')
      .select('contract_high_since, max_contract_price, max_profit')
      .eq('id', trade.id)
      .single();

    if (updatedTrade) {
      console.log(`  📊 New High (contract_high_since): $${updatedTrade.contract_high_since}`);
      console.log(`  📊 New High (max_contract_price): $${updatedTrade.max_contract_price}`);
      console.log(`  💰 Max Profit: $${updatedTrade.max_profit}`);
    }
  }

  console.log('\n✅ Done fixing high watermarks!');
}

fixHighWatermarks().catch(console.error);
