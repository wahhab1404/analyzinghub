import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testManualTradeSnapshot() {
  console.log('🧪 Testing Manual Trade Snapshot Generation\n');

  console.log('Step 1: Creating a test manual trade...');
  const testEntry = 3.50;
  const testHigh = 7.00;
  const profitPercent = ((testHigh - testEntry) / testEntry) * 100;
  const profitDollars = (testHigh - testEntry) * 100;
  const isWinner = profitDollars >= 100;

  console.log(`Entry: $${testEntry}, High: $${testHigh}`);
  console.log(`Profit: ${profitPercent.toFixed(2)}% ($${profitDollars.toFixed(2)})`);
  console.log(`Is Winner: ${isWinner ? 'YES ✅' : 'NO'}\n`);

  const { data: users } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (!users || users.length === 0) {
    console.error('❌ No users found');
    return;
  }

  const userId = users[0].id;

  const entrySnapshot = {
    price: testEntry,
    mid: testEntry,
    last: testEntry,
    bid: testEntry - 0.05,
    ask: testEntry + 0.05,
    volume: 0,
    open_interest: 0,
    timestamp: new Date().toISOString(),
  };

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);

  const { data: trade, error: insertError } = await supabase
    .from('index_trades')
    .insert({
      author_id: userId,
      underlying_index_symbol: 'SPX',
      strike: 6900,
      direction: 'call',
      option_type: 'call',
      expiry: expiry.toISOString().split('T')[0],
      entry_contract_snapshot: entrySnapshot,
      current_contract: testHigh,
      contract_high_since: testHigh,
      status: isWinner ? 'closed' : 'active',
      qty: 1,
      contract_multiplier: 100,
      pnl_usd: profitDollars,
      final_profit: profitDollars,
      is_winning_trade: isWinner,
      is_manual_entry: true,
      telegram_send_enabled: false,
    })
    .select()
    .single();

  if (insertError) {
    console.error('❌ Error creating trade:', insertError);
    return;
  }

  console.log(`✅ Trade created: ID ${trade.id}\n`);

  console.log('Step 2: Calling snapshot generation edge function...');
  const snapshotUrl = `${supabaseUrl}/functions/v1/generate-trade-snapshot`;
  console.log(`Calling: ${snapshotUrl}`);

  try {
    const response = await fetch(snapshotUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        tradeId: trade.id,
        isNewHigh: true,
        newHighPrice: testHigh,
      }),
    });

    console.log(`Response status: ${response.status}\n`);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Snapshot generated successfully!');
      console.log('Image URL:', result.imageUrl);

      await supabase
        .from('index_trades')
        .update({ contract_url: result.imageUrl })
        .eq('id', trade.id);

      console.log('✅ Trade updated with image URL');
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to generate snapshot (${response.status}):`);
      console.error(errorText);
    }
  } catch (error: any) {
    console.error('❌ Exception calling snapshot generation:');
    console.error(error.message);
  }

  console.log('\n🔍 Checking trade in database...');
  const { data: updatedTrade } = await supabase
    .from('index_trades')
    .select('id, contract_url, status, is_winning_trade, pnl_usd')
    .eq('id', trade.id)
    .single();

  if (updatedTrade) {
    console.log('Trade status:', updatedTrade.status);
    console.log('Is winning:', updatedTrade.is_winning_trade);
    console.log('P&L:', updatedTrade.pnl_usd);
    console.log('Image URL:', updatedTrade.contract_url || 'NOT SET ❌');
  }

  console.log('\n✅ Test complete!');
  console.log(`View trade at: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/indices`);
}

testManualTradeSnapshot().catch(console.error);
