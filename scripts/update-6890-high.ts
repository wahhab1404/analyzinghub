import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Updating 6890 PUT high to 13.10...\n');

  const { error } = await supabase
    .from('index_trades')
    .update({
      contract_high_since: 13.10,
      current_contract: 13.10,
      updated_at: new Date().toISOString()
    })
    .eq('id', '172710e4-0734-40f5-b2a3-f19e927666a1');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✓ Updated 6890 PUT high to 13.10');
  }

  // Verify update
  const { data, error: verifyError } = await supabase
    .from('index_trades')
    .select('strike, option_type, entry_contract_snapshot, contract_high_since')
    .eq('id', '172710e4-0734-40f5-b2a3-f19e927666a1')
    .single();

  if (verifyError) {
    console.error('Error verifying:', verifyError);
  } else {
    const entryPrice = data.entry_contract_snapshot?.mid || data.entry_contract_snapshot?.last || 0;
    console.log(`\nVerified: Strike ${data.strike} ${data.option_type}`);
    console.log(`  Entry: ${entryPrice}`);
    console.log(`  High: ${data.contract_high_since}`);
    console.log(`  Profit: $${((data.contract_high_since - entryPrice) * 100).toFixed(2)}`);
  }
}

main();
