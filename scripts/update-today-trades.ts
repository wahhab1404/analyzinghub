import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Updating trades for 2026-01-30...\n');

  // Update 6900 PUT high to 17.8
  console.log('1. Updating 6900 PUT high to 17.8...');
  const { error: error1 } = await supabase
    .from('index_trades')
    .update({
      contract_high_since: 17.8,
      current_contract: 17.8,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'cd583bfb-7d7d-4adf-847b-256cd4e2bb56');

  if (error1) {
    console.error('Error updating 6900 PUT:', error1);
  } else {
    console.log('✓ Updated 6900 PUT high to 17.8');
  }

  // Update 6915 PUT entry to 3.00 and high to 7.4
  console.log('\n2. Updating 6915 PUT entry to 3.00 and high to 7.4...');

  // First, get the current entry snapshot
  const { data: trade6915, error: fetchError } = await supabase
    .from('index_trades')
    .select('entry_contract_snapshot')
    .eq('id', '824f892a-ee65-43af-a198-6c11612a5a10')
    .single();

  if (fetchError) {
    console.error('Error fetching 6915 trade:', fetchError);
  } else {
    const updatedSnapshot = {
      ...trade6915.entry_contract_snapshot,
      mid: 3.00,
      last: 3.00
    };

    const { error: error2 } = await supabase
      .from('index_trades')
      .update({
        entry_contract_snapshot: updatedSnapshot,
        contract_high_since: 7.4,
        current_contract: 7.4,
        updated_at: new Date().toISOString()
      })
      .eq('id', '824f892a-ee65-43af-a198-6c11612a5a10');

    if (error2) {
      console.error('Error updating 6915 PUT:', error2);
    } else {
      console.log('✓ Updated 6915 PUT entry to 3.00 and high to 7.4');
    }
  }

  // Update 6880 PUT entry to 3.95 and high to 9.4
  console.log('\n3. Updating 6880 PUT entry to 3.95 and high to 9.4...');

  // First, get the current entry snapshot
  const { data: trade6880, error: fetchError2 } = await supabase
    .from('index_trades')
    .select('entry_contract_snapshot')
    .eq('id', '7b870a29-83e3-4b8d-b707-87007d10682c')
    .single();

  if (fetchError2) {
    console.error('Error fetching 6880 trade:', fetchError2);
  } else {
    const updatedSnapshot = {
      ...trade6880.entry_contract_snapshot,
      mid: 3.95,
      last: 3.95
    };

    const { error: error3 } = await supabase
      .from('index_trades')
      .update({
        entry_contract_snapshot: updatedSnapshot,
        contract_high_since: 9.4,
        current_contract: 9.4,
        updated_at: new Date().toISOString()
      })
      .eq('id', '7b870a29-83e3-4b8d-b707-87007d10682c');

    if (error3) {
      console.error('Error updating 6880 PUT:', error3);
    } else {
      console.log('✓ Updated 6880 PUT entry to 3.95 and high to 9.4');
    }
  }

  console.log('\n✅ All trades updated successfully!');

  // Verify updates
  console.log('\nVerifying updates...');
  const { data, error } = await supabase
    .from('index_trades')
    .select('id, strike, option_type, entry_contract_snapshot, contract_high_since')
    .in('id', [
      'cd583bfb-7d7d-4adf-847b-256cd4e2bb56',
      '824f892a-ee65-43af-a198-6c11612a5a10',
      '7b870a29-83e3-4b8d-b707-87007d10682c'
    ])
    .order('strike', { ascending: true });

  if (error) {
    console.error('Error verifying:', error);
  } else {
    console.log('\nUpdated trades:');
    data.forEach(t => {
      const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
      console.log(`- Strike ${t.strike} ${t.option_type}: Entry ${entryPrice}, High ${t.contract_high_since}`);
    });
  }
}

main();
