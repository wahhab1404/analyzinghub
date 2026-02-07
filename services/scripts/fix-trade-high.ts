import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTradeHigh() {
  console.log('🔧 Finding SPX $6915 CALL trade...\n');

  // Find the trade by strike and type
  const { data: trades, error: searchError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('strike', 6915)
    .eq('option_type', 'call')
    .eq('underlying_index_symbol', 'SPX')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (searchError) {
    console.error('❌ Error finding trade:', searchError);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('❌ No active SPX $6915 CALL trade found');
    return;
  }

  const trade = trades[0];
  console.log('✅ Found trade:', trade.id);
  console.log('📊 Current data:');
  console.log('   Entry:', trade.entry_contract_snapshot?.mid);
  console.log('   Current:', trade.current_contract);
  console.log('   High:', trade.contract_high_since);
  console.log('   Low:', trade.contract_low_since);
  console.log();

  // Ask user for correct high value
  const correctHigh = 10.25; // Based on your message

  console.log(`📝 Updating high to $${correctHigh}...`);

  const { data: updated, error: updateError } = await supabase
    .from('index_trades')
    .update({
      contract_high_since: correctHigh,
      manual_contract_high: correctHigh,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trade.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Error updating trade:', updateError);
    return;
  }

  console.log('✅ Trade updated successfully!');
  console.log('📊 New data:');
  console.log('   High:', updated.contract_high_since);
  console.log();

  // Add a trade update entry
  await supabase
    .from('index_trade_updates')
    .insert({
      trade_id: trade.id,
      update_type: 'correction',
      title: 'Manual High Correction',
      body: `High corrected from $${trade.contract_high_since} to $${correctHigh}`,
      changes: {
        type: 'manual_correction',
        old_high: trade.contract_high_since,
        new_high: correctHigh,
      },
    });

  console.log('✅ Trade update logged');
}

fixTradeHigh().catch(console.error);
