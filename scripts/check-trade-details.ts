import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTradeDetails() {
  console.log('=== Trade Details ===\n');

  const { data: trade, error } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!trade) {
    console.log('No active trades found');
    return;
  }

  console.log('Trade ID:', trade.id);
  console.log('Option:', trade.polygon_option_ticker);
  console.log('Status:', trade.status);
  console.log('');

  const entrySnapshot = trade.entry_contract_snapshot || {};
  const entryPrice = entrySnapshot.mid || entrySnapshot.last || 0;
  const currentPrice = trade.current_contract || 0;
  const highSince = trade.contract_high_since || entryPrice;
  const lowSince = trade.contract_low_since || entryPrice;

  console.log('Entry Price:', entryPrice.toFixed(4));
  console.log('Current Price:', currentPrice.toFixed(4));
  console.log('High Since Entry:', highSince.toFixed(4));
  console.log('Low Since Entry:', lowSince.toFixed(4));
  console.log('');

  const pnl = (currentPrice - entryPrice) * (trade.qty || 1);
  const percentChange = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  const percentGainFromHigh = entryPrice > 0 ? ((highSince - entryPrice) / entryPrice) * 100 : 0;

  console.log('Current P&L:', pnl.toFixed(2), `(${percentChange.toFixed(2)}%)`);
  console.log('Max Gain:', percentGainFromHigh.toFixed(2), '%');
  console.log('');

  console.log('Win $100 Announced?', trade.win_100_announced || false);
  console.log('Telegram Send Enabled?', trade.telegram_send_enabled !== false);
  console.log('Telegram Channel ID:', trade.telegram_channel_id || 'none');
  console.log('');

  console.log('Entry Snapshot:', JSON.stringify(entrySnapshot, null, 2));
  console.log('');
  console.log('Current Snapshot:', JSON.stringify(trade.current_contract_snapshot, null, 2));
  console.log('');

  // Check trade updates
  const { data: updates } = await supabase
    .from('index_trade_updates')
    .select('*')
    .eq('trade_id', trade.id)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('Recent Updates:');
  for (const update of updates || []) {
    console.log(`  ${update.created_at}: ${update.update_type} - ${update.title}`);
  }
}

checkTradeDetails().catch(console.error);
