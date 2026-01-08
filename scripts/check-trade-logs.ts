import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTradeLogs() {
  console.log('=== CHECKING TRADE UPDATE LOGS ===\n');

  // Get recent price updates for all trades
  const { data: updates, error } = await supabase
    .from('indices_trade_price_history')
    .select(`
      *,
      indices_trades!inner(
        contract_symbol,
        entry_price,
        status
      )
    `)
    .order('tracked_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching updates:', error);
    return;
  }

  console.log(`Found ${updates?.length || 0} recent price updates:\n`);

  updates?.forEach((update, idx) => {
    const trade = update.indices_trades as any;
    const changePercent = ((update.price - trade.entry_price) / trade.entry_price * 100).toFixed(2);
    const pnl = update.price - trade.entry_price;

    console.log(`${idx + 1}. ${trade.contract_symbol}`);
    console.log(`   Price: $${update.price} (${pnl >= 0 ? '+' : ''}${changePercent}%)`);
    console.log(`   Time: ${new Date(update.tracked_at).toLocaleString()}`);
    console.log(`   Status: ${trade.status}\n`);
  });

  // Check cron execution status
  console.log('\n=== CHECKING EDGE FUNCTION INVOCATIONS ===\n');

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/indices-trade-tracker`;
  console.log(`Function URL: ${functionUrl}`);
  console.log('\nTo check function logs:');
  console.log('1. Go to Supabase Dashboard → Edge Functions');
  console.log('2. Click on "indices-trade-tracker"');
  console.log('3. View the "Invocations" and "Logs" tabs\n');
}

checkTradeLogs().catch(console.error);
