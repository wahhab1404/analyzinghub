import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTradeDelete() {
  console.log('\n=== Testing Trade Deletion ===\n');

  // Get a trade to delete
  const { data: trades, error: fetchError } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, strike, direction, author_id')
    .limit(1);

  if (fetchError) {
    console.error('Error fetching trades:', fetchError);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('No trades found to delete');
    return;
  }

  const trade = trades[0];
  console.log('Trade to delete:', trade);

  // Check the user's role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role_id, role:roles!inner(name)')
    .eq('id', trade.author_id)
    .maybeSingle();

  console.log('Author profile:', profile);
  console.log('Author role:', (profile as any)?.role?.name);

  // Check for related records
  const { data: updates, error: updatesError } = await supabase
    .from('trade_updates')
    .select('id')
    .eq('trade_id', trade.id);

  console.log('Related trade_updates:', updates?.length || 0);

  const { data: reentries, error: reentriesError } = await supabase
    .from('trade_reentry_links')
    .select('id')
    .eq('original_trade_id', trade.id);

  console.log('Related trade_reentry_links (as original):', reentries?.length || 0);

  const { data: reentries2, error: reentries2Error } = await supabase
    .from('trade_reentry_links')
    .select('id')
    .eq('reentry_trade_id', trade.id);

  console.log('Related trade_reentry_links (as reentry):', reentries2?.length || 0);

  // Try to delete using service role
  console.log('\nAttempting delete with service role...');
  const { error: deleteError } = await supabase
    .from('index_trades')
    .delete()
    .eq('id', trade.id);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    console.error('Error details:', JSON.stringify(deleteError, null, 2));
  } else {
    console.log('✓ Trade deleted successfully with service role');
  }
}

testTradeDelete().catch(console.error);
