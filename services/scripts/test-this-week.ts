import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testThisWeek() {
  console.log('=== Testing This Week Report (Should have 5 trades from Jan 30) ===\n');

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-period-report`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          start_date: '2026-01-26',
          end_date: '2026-01-30',
          period_type: 'weekly',
          language_mode: 'dual',
          dry_run: true,
          analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f'
        }),
      }
    );

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Error response:', errorData);
      return;
    }

    const result = await response.json();
    console.log('\nResult:');
    console.log('- Total trades:', result.metrics?.total_trades || 0);
    console.log('- Active trades:', result.metrics?.active_trades || 0);
    console.log('- Closed trades:', result.metrics?.closed_trades || 0);
    console.log('- Winning trades:', result.metrics?.winning_trades || 0);
    console.log('- Losing trades:', result.metrics?.losing_trades || 0);
    console.log('- Win rate:', result.metrics?.win_rate?.toFixed(1) || 0, '%');
    console.log('- Net profit: $', result.metrics?.net_profit || 0);
    console.log('- Total profit: $', result.metrics?.total_profit || 0);
    console.log('- Total loss: $', result.metrics?.total_loss || 0);
  } catch (error) {
    console.error('Error calling API:', error);
  }
}

testThisWeek();
