import 'dotenv/config';

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('//', '//').split('.supabase.co')[0] + '.supabase.co' || 'http://localhost:3000';

async function testFullFlow() {
  console.log('=== Testing Full Report Generation Flow ===\n');

  // Test 1: This Week (should have 5 trades from Jan 30)
  console.log('Test 1: Generating This Week Report (offset=0)');
  console.log('Expected: Jan 26-30, 5 trades, $3,230 profit\n');

  try {
    const response1 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-period-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        start_date: '2026-01-26',
        end_date: '2026-01-30',
        period_type: 'weekly',
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      })
    });

    if (!response1.ok) {
      const error = await response1.text();
      console.error('❌ Failed:', error);
    } else {
      const result1 = await response1.json();
      console.log('✅ Success!');
      console.log(`   Report ID: ${result1.report_id}`);
      console.log(`   Trades: ${result1.metrics.total_trades}`);
      console.log(`   Net Profit: $${result1.metrics.net_profit}`);
      console.log(`   Win Rate: ${result1.metrics.win_rate.toFixed(1)}%`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n---\n');

  // Test 2: Last Week (should have 2 trades from Jan 23)
  console.log('Test 2: Generating Last Week Report (offset=-1)');
  console.log('Expected: Jan 19-23, 2 trades, $487.50 profit\n');

  try {
    const response2 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-period-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        start_date: '2026-01-19',
        end_date: '2026-01-23',
        period_type: 'weekly',
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      })
    });

    if (!response2.ok) {
      const error = await response2.text();
      console.error('❌ Failed:', error);
    } else {
      const result2 = await response2.json();
      console.log('✅ Success!');
      console.log(`   Report ID: ${result2.report_id}`);
      console.log(`   Trades: ${result2.metrics.total_trades}`);
      console.log(`   Net Profit: $${result2.metrics.net_profit}`);
      console.log(`   Win Rate: ${result2.metrics.win_rate.toFixed(1)}%`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n---\n');

  // Test 3: Last Month (January - should have all trades)
  console.log('Test 3: Generating Last Month Report');
  console.log('Expected: January 2026, ~10 trades\n');

  try {
    const response3 = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-period-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        period_type: 'monthly',
        language_mode: 'dual',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
      })
    });

    if (!response3.ok) {
      const error = await response3.text();
      console.error('❌ Failed:', error);
    } else {
      const result3 = await response3.json();
      console.log('✅ Success!');
      console.log(`   Report ID: ${result3.report_id}`);
      console.log(`   Trades: ${result3.metrics.total_trades}`);
      console.log(`   Net Profit: $${result3.metrics.net_profit}`);
      console.log(`   Win Rate: ${result3.metrics.win_rate.toFixed(1)}%`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  console.log('\n=== All Tests Complete ===');
}

testFullFlow();
