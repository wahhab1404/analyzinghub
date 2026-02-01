import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Finding trades to delete...\n');

  // Find 6970 CALL
  const { data: call6970, error: callError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('strike', 6970)
    .eq('option_type', 'call')
    .gte('published_at', '2026-01-30')
    .lte('published_at', '2026-01-30T23:59:59')
    .single();

  if (callError) {
    console.log('6970 CALL not found or error:', callError);
  } else {
    console.log(`Found 6970 CALL: ID ${call6970.id}`);
    console.log(`  Entry: $${call6970.entry_contract_snapshot?.mid || call6970.entry_contract_snapshot?.last}`);
  }

  // Find 6900 PUT with entry ~2.77
  const { data: put6900List, error: putError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('strike', 6900)
    .eq('option_type', 'put')
    .gte('published_at', '2026-01-30')
    .lte('published_at', '2026-01-30T23:59:59');

  if (putError) {
    console.log('6900 PUT not found or error:', putError);
  } else {
    console.log(`\nFound ${put6900List.length} 6900 PUT trades:`);
    put6900List.forEach(t => {
      const entry = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last;
      console.log(`  ID: ${t.id}, Entry: $${entry}`);
    });

    const put6900 = put6900List.find(t => {
      const entry = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last;
      return Math.abs(entry - 2.775) < 0.01;
    });

    if (put6900) {
      console.log(`\nDeleting trades...`);

      // Delete 6970 CALL
      if (call6970) {
        const { error: deleteCallError } = await supabase
          .from('index_trades')
          .delete()
          .eq('id', call6970.id);

        if (deleteCallError) {
          console.error('Error deleting 6970 CALL:', deleteCallError);
        } else {
          console.log('✓ Deleted 6970 CALL');
        }
      }

      // Delete 6900 PUT
      const { error: deletePutError } = await supabase
        .from('index_trades')
        .delete()
        .eq('id', put6900.id);

      if (deletePutError) {
        console.error('Error deleting 6900 PUT:', deletePutError);
      } else {
        console.log('✓ Deleted 6900 PUT (entry $2.775)');
      }

      console.log('\n✓ Trades deleted successfully!');
    } else {
      console.log('Could not find 6900 PUT with entry ~$2.775');
    }
  }

  // Show remaining trades
  console.log('\nRemaining trades for Jan 30, 2026:');
  const { data: remaining } = await supabase
    .from('index_trades')
    .select('strike, option_type, entry_contract_snapshot, contract_high_since')
    .gte('published_at', '2026-01-30')
    .lte('published_at', '2026-01-30T23:59:59')
    .order('strike', { ascending: true });

  remaining?.forEach(t => {
    const entry = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last;
    console.log(`- Strike ${t.strike} ${t.option_type}: Entry $${entry}, High $${t.contract_high_since}`);
  });
}

main();
