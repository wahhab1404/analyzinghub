import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTradeHistory() {
  console.log('=== Trade History Check ===\n');

  const { data: trade } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active')
    .single();

  if (!trade) {
    console.log('No active trade found');
    return;
  }

  console.log('Trade ID:', trade.id);
  console.log('Option:', trade.polygon_option_ticker);
  console.log('Created:', trade.created_at);
  console.log('Published:', trade.published_at);
  console.log('Last Quote:', trade.last_quote_at);
  console.log('');

  const entrySnapshot = trade.entry_contract_snapshot || {};
  const entryPrice = entrySnapshot.mid || entrySnapshot.last || 0;
  const currentPrice = trade.current_contract || 0;
  const highSince = trade.contract_high_since || entryPrice;
  const lowSince = trade.contract_low_since || entryPrice;

  console.log('Entry Price:', entryPrice.toFixed(4));
  console.log('Current Price:', currentPrice.toFixed(4));
  console.log('High Since Entry:', highSince.toFixed(4), `(+${((highSince - entryPrice) / entryPrice * 100).toFixed(2)}%)`);
  console.log('Low Since Entry:', lowSince.toFixed(4));
  console.log('');

  console.log('❌ PROBLEM: High is only $' + highSince.toFixed(2) + ' but you said it reached $8.20!');
  console.log('This means the trade tracker was not running when the high occurred.');
  console.log('');

  // Check index_trade_updates
  const { data: updates } = await supabase
    .from('index_trade_updates')
    .select('*')
    .eq('trade_id', trade.id)
    .order('created_at', { ascending: true });

  console.log('Index Trade Updates:');
  console.log(`Found ${updates?.length || 0} updates\n`);

  for (const update of updates || []) {
    console.log('─'.repeat(80));
    console.log('Time:', update.created_at);
    console.log('Type:', update.update_type);
    console.log('Title:', update.title);
    if (update.changes) {
      const changes = update.changes as any;
      if (changes.price) console.log('Price:', changes.price);
      if (changes.gain_percent) console.log('Gain:', changes.gain_percent + '%');
      if (changes.pnl_usd) console.log('P&L:', '$' + changes.pnl_usd);
    }
    console.log('');
  }

  // Check if cron was running
  console.log('─'.repeat(80));
  console.log('Checking when trade was published vs when tracking started...\n');

  const publishedTime = new Date(trade.published_at);
  const firstQuoteTime = trade.last_quote_at ? new Date(trade.last_quote_at) : null;

  console.log('Published:', publishedTime.toISOString());
  if (firstQuoteTime) {
    console.log('First quote:', firstQuoteTime.toISOString());
    const delayMinutes = (firstQuoteTime.getTime() - publishedTime.getTime()) / 1000 / 60;
    console.log('Delay:', delayMinutes.toFixed(1), 'minutes');

    if (delayMinutes > 2) {
      console.log('⚠️  WARNING: There was a ' + delayMinutes.toFixed(1) + ' minute gap!');
      console.log('The $8.20 high likely occurred during this gap when tracker was not updating.');
    }
  } else {
    console.log('⚠️  No quote timestamp found');
  }
}

checkTradeHistory().catch(console.error);
