import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJan30Analyses() {
  console.log('Checking all analyses for January 30, 2026...\n');

  const { data: analyses, error } = await supabase
    .from('index_analyses')
    .select(`
      *,
      trades:index_trades(*)
    `)
    .gte('created_at', '2026-01-30T00:00:00')
    .lt('created_at', '2026-01-31T00:00:00')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!analyses || analyses.length === 0) {
    console.log('No analyses found for January 30, 2026');
    return;
  }

  console.log(`Found ${analyses.length} analyses:\n`);

  analyses.forEach((analysis, index) => {
    console.log(`${index + 1}. Analysis ID: ${analysis.id}`);
    console.log(`   Symbol: ${analysis.symbol}`);
    console.log(`   Strike: ${analysis.strike_price}`);
    console.log(`   Type: ${analysis.option_type}`);
    console.log(`   Entry: $${analysis.entry_price}`);
    console.log(`   Status: ${analysis.status}`);
    console.log(`   Created: ${analysis.created_at}`);

    if (analysis.trades && analysis.trades.length > 0) {
      console.log(`   Trades (${analysis.trades.length}):`);
      analysis.trades.forEach((trade: any) => {
        const profit = trade.final_profit_usd || trade.current_profit_usd || 0;
        const profitPercent = trade.final_profit_percent || trade.current_profit_percent || 0;
        console.log(`     - Strike ${trade.strike_price || 'N/A'} ${trade.option_type}: Entry $${trade.entry_price || 'N/A'}, Profit: $${profit.toFixed(2)} (${profitPercent.toFixed(1)}%)`);
      });
    } else {
      console.log(`   Trades: None`);
    }
    console.log('');
  });
}

checkJan30Analyses();
