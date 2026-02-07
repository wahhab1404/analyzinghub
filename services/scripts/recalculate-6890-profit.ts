import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Recalculating 6890 PUT profit after high update...\n');

  // Get the trade
  const { data: trade, error: fetchError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('id', '172710e4-0734-40f5-b2a3-f19e927666a1')
    .single();

  if (fetchError) {
    console.error('Error fetching trade:', fetchError);
    return;
  }

  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const highestPrice = 13.10;
  const qty = trade.qty || 1;
  const multiplier = trade.contract_multiplier || 100;

  const maxProfit = (highestPrice - entryPrice) * qty * multiplier;

  console.log(`Entry: $${entryPrice}`);
  console.log(`High: $${highestPrice}`);
  console.log(`Qty: ${qty}`);
  console.log(`Max Profit: $${maxProfit.toFixed(2)}`);

  // Determine outcome
  let isWinningTrade = maxProfit >= 100;
  let tradeOutcome = 'small_win';
  let finalProfit = maxProfit;

  if (maxProfit >= 500) {
    tradeOutcome = 'big_win';
  } else if (maxProfit >= 100) {
    tradeOutcome = 'small_win';
  } else {
    tradeOutcome = 'small_loss';
    isWinningTrade = false;
  }

  console.log(`Outcome: ${tradeOutcome}`);
  console.log(`Is Winner: ${isWinningTrade}`);

  // Update the trade with new profit calculations
  const { error: updateError } = await supabase
    .from('index_trades')
    .update({
      profit_from_entry: finalProfit,
      pnl_usd: finalProfit,
      final_profit: finalProfit,
      computed_profit_usd: finalProfit,
      max_profit: finalProfit,
      is_winning_trade: isWinningTrade,
      is_win: isWinningTrade,
      trade_outcome: tradeOutcome,
      outcome: isWinningTrade ? 'succeed' : 'loss',
      updated_at: new Date().toISOString()
    })
    .eq('id', '172710e4-0734-40f5-b2a3-f19e927666a1');

  if (updateError) {
    console.error('Error updating:', updateError);
  } else {
    console.log('\n✓ Profit recalculated and updated successfully!');
  }
}

main();
