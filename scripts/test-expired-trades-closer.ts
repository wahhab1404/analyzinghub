import { config } from 'dotenv';

config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function testExpiredTradesCloser() {
  console.log('🔍 Testing Expired Trades Closer Function...\n');

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/expired-trades-closer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    console.log('📊 Response Status:', response.status);
    console.log('📋 Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Function executed successfully!');
      console.log('\n📈 Summary:');
      console.log(`   - Total Active Trades Checked: ${result.summary.totalActiveChecked}`);
      console.log(`   - Expired Trades Found: ${result.summary.expiredFound}`);
      console.log(`   - Successfully Closed: ${result.summary.closedSuccessfully}`);
      console.log(`   - Errors: ${result.summary.errors}`);

      if (result.closedTrades && result.closedTrades.length > 0) {
        console.log('\n🎯 Closed Trades:');
        result.closedTrades.forEach((trade: any) => {
          const status = trade.isWin ? '✅ WIN' : '❌ LOSS';
          console.log(`   ${status} - ${trade.symbol} ${trade.strike}${trade.optionType.toUpperCase()}`);
          console.log(`      Max Profit: $${trade.maxProfit.toFixed(2)}`);
          console.log(`      Final P/L: $${trade.finalProfit.toFixed(2)}`);
          console.log(`      Outcome: ${trade.outcome.toUpperCase()}`);
          console.log(`      Expiry: ${trade.expiry}`);
          console.log('');
        });
      }

      if (result.errors && result.errors.length > 0) {
        console.log('\n⚠️ Errors:');
        result.errors.forEach((error: any) => {
          console.log(`   Trade ${error.tradeId}: ${error.error}`);
        });
      }
    } else {
      console.log('\n❌ Function execution failed');
    }
  } catch (error) {
    console.error('❌ Error testing function:', error);
  }
}

testExpiredTradesCloser();
