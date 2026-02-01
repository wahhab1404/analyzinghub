import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addLosingTrade() {
  console.log('Adding losing trade for January 30, 2026...\n');

  // Get first user
  const { data: users } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (!users || users.length === 0) {
    console.error('No users found');
    return;
  }

  const authorId = users[0].id;
  console.log('Using Author ID:', authorId);

  // Check for existing analysis on Jan 30
  const { data: existingAnalyses } = await supabase
    .from('index_analyses')
    .select('*')
    .gte('created_at', '2026-01-30T00:00:00')
    .lt('created_at', '2026-01-31T00:00:00');

  let analysisId = null;

  if (existingAnalyses && existingAnalyses.length > 0) {
    analysisId = existingAnalyses[0].id;
    console.log('Found existing analysis:', analysisId);
  } else {
    console.log('No existing analysis found for Jan 30');
  }

  // Trade details
  const entryPrice = 1.95;
  const exitPrice = 0.00;
  const lossAmount = -195;
  const strikePrice = 6970;
  const optionType = 'call';

  // Calculate entry cost
  const contractMultiplier = 100;
  const entryCostUsd = entryPrice * contractMultiplier; // $195

  // Create entry snapshots
  const entryContractSnapshot = {
    price: entryPrice,
    timestamp: '2026-01-30T15:00:00Z',
    source: 'manual'
  };

  const entryUnderlyingSnapshot = {
    price: 6970, // SPX was around strike at entry
    timestamp: '2026-01-30T15:00:00Z',
    source: 'manual'
  };

  // Add the losing trade
  const { data: trade, error: tradeError } = await supabase
    .from('index_trades')
    .insert({
      analysis_id: analysisId,
      author_id: authorId,
      underlying_index_symbol: 'SPX',
      polygon_underlying_index_ticker: 'I:SPX',
      polygon_option_ticker: 'O:SPX260130C06970000',
      strike: strikePrice,
      option_type: optionType,
      direction: optionType,
      instrument_type: 'options',
      contract_multiplier: contractMultiplier,
      entry_contract_snapshot: entryContractSnapshot,
      entry_underlying_snapshot: entryUnderlyingSnapshot,
      current_contract: exitPrice,
      contract_high_since: entryPrice,
      contract_low_since: exitPrice,
      max_contract_price: entryPrice,
      status: 'closed',
      outcome: 'loss',
      pnl_usd: lossAmount,
      final_profit: lossAmount,
      computed_profit_usd: lossAmount,
      entry_cost_usd: entryCostUsd,
      max_profit: 0,
      profit_from_entry: lossAmount,
      is_win: false,
      is_winning_trade: false,
      trade_outcome: 'big_loss',
      counted_in_stats: true,
      expiry: '2026-01-30',
      qty: 1,
      created_at: '2026-01-30T15:00:00Z',
      published_at: '2026-01-30T15:00:00Z',
      closed_at: '2026-01-30T23:59:59Z'
    })
    .select()
    .single();

  if (tradeError) {
    console.error('Error creating trade:', tradeError);
    return;
  }

  console.log('\n✅ Successfully added losing trade:');
  console.log('Trade ID:', trade.id);
  console.log('Symbol: SPX');
  console.log('Strike: 6970 CALL');
  console.log('Entry: $1.95');
  console.log('Exit: $0.00');
  console.log('Loss: -$195');
  console.log('Status: closed (loss)');
  console.log('\nThe trade has been added to the January 30, 2026 report.');
}

addLosingTrade();
