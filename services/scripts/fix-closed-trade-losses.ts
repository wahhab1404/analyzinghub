import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function fixClosedTradeLosses() {
  console.log('🔧 Fixing closed trade losses...\n');

  const { data: closedTrades, error } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'closed')
    .eq('instrument_type', 'options');

  if (error) {
    console.error('❌ Error fetching trades:', error);
    return;
  }

  if (!closedTrades || closedTrades.length === 0) {
    console.log('No closed trades found');
    return;
  }

  console.log(`Found ${closedTrades.length} closed trades\n`);

  const tradesToFix = [];

  for (const trade of closedTrades) {
    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
    const maxProfit = parseFloat(trade.max_profit?.toString() || '0');
    const qty = trade.qty || 1;
    const multiplier = trade.contract_multiplier || 100;
    const totalCost = entryPrice * qty * multiplier;

    let correctPnl: number;
    let correctOutcome: string;
    let isWin: boolean;

    if (maxProfit >= 100) {
      isWin = true;
      correctPnl = maxProfit;
      correctOutcome = maxProfit >= 500 ? 'big_win' : 'small_win';
    } else {
      isWin = false;
      correctPnl = -totalCost;
      correctOutcome = totalCost >= 500 ? 'big_loss' : 'small_loss';
    }

    const currentPnl = parseFloat(trade.pnl_usd?.toString() || '0');

    if (Math.abs(currentPnl - correctPnl) > 0.01) {
      tradesToFix.push({
        id: trade.id,
        symbol: trade.underlying_index_symbol,
        strike: trade.strike,
        optionType: trade.option_type,
        entryPrice,
        maxProfit,
        totalCost,
        currentPnl,
        correctPnl,
        currentOutcome: trade.outcome,
        correctOutcome,
        isWin
      });
    }
  }

  console.log(`\n📊 Found ${tradesToFix.length} trades with incorrect P/L\n`);

  if (tradesToFix.length === 0) {
    console.log('✅ All trades have correct P/L values!');
    return;
  }

  console.log('Trades to fix:');
  console.log('═══════════════════════════════════════════════════════════════');

  for (const trade of tradesToFix) {
    console.log(`\n${trade.symbol} ${trade.strike}${trade.optionType}`);
    console.log(`  Entry: $${trade.entryPrice.toFixed(2)}`);
    console.log(`  Max Profit: $${trade.maxProfit.toFixed(2)}`);
    console.log(`  Total Cost: $${trade.totalCost.toFixed(2)}`);
    console.log(`  Current P/L: $${trade.currentPnl.toFixed(2)} ❌`);
    console.log(`  Correct P/L: $${trade.correctPnl.toFixed(2)} ✅`);
    console.log(`  Outcome: ${trade.currentOutcome} → ${trade.correctOutcome}`);
  }

  console.log('\n\n🔄 Fixing trades...\n');

  let fixed = 0;
  let errors = 0;

  for (const trade of tradesToFix) {
    const { error: updateError } = await supabase
      .from('index_trades')
      .update({
        pnl_usd: trade.correctPnl,
        final_profit: trade.correctPnl,
        computed_profit_usd: trade.correctPnl,
        profit_from_entry: trade.correctPnl,
        is_winning_trade: trade.isWin,
        is_win: trade.isWin,
        trade_outcome: trade.correctOutcome,
        outcome: trade.isWin ? 'succeed' : 'loss',
        counted_in_stats: true
      })
      .eq('id', trade.id);

    if (updateError) {
      console.error(`❌ Failed to fix trade ${trade.id}:`, updateError.message);
      errors++;
    } else {
      console.log(`✅ Fixed ${trade.symbol} ${trade.strike}${trade.optionType}: $${trade.currentPnl.toFixed(2)} → $${trade.correctPnl.toFixed(2)}`);
      fixed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`\n✅ Fixed ${fixed} trades`);
  if (errors > 0) {
    console.log(`❌ ${errors} errors`);
  }
  console.log('\n🎉 Done!');
}

fixClosedTradeLosses().catch(console.error);
