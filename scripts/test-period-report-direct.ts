import { config } from 'dotenv';

config();

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Testing period report generation for 2026-01-30...\n');

  const response = await fetch(
    `${supabaseUrl}/functions/v1/generate-period-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        start_date: '2026-01-30',
        end_date: '2026-01-30',
        analyst_id: '39e2a757-8104-4166-9504-9c8c5534f56f',
        language_mode: 'dual',
        period_type: 'daily',
        dry_run: true
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error:', error);
    return;
  }

  const result = await response.json();

  console.log('Report metrics:');
  console.log('  Total trades:', result.metrics?.total_trades || 0);
  console.log('  Active trades:', result.metrics?.active_trades || 0);
  console.log('  Closed trades:', result.metrics?.closed_trades || 0);
  console.log('  Expired trades:', result.metrics?.expired_trades || 0);
  console.log('  Winning trades:', result.metrics?.winning_trades || 0);
  console.log('  Losing trades:', result.metrics?.losing_trades || 0);
  console.log('  Win rate:', result.metrics?.win_rate?.toFixed(1) || 0, '%');
  console.log('  Net profit:', result.metrics?.net_profit || 0);
}

main();
