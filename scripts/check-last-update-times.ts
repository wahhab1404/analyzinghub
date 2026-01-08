import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('='.repeat(70));
  console.log('CHECKING LAST UPDATE TIMES FOR ACTIVE TRADES');
  console.log('='.repeat(70));
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log(`Current Time ET: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  console.log('');

  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, polygon_underlying_index_ticker, current_contract, current_underlying, last_quote_at, created_at')
    .eq('status', 'active')
    .order('last_quote_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('❌ No active trades found');
    return;
  }

  console.log(`Found ${trades.length} active trade(s):\n`);

  for (const trade of trades) {
    const now = new Date();
    const lastUpdate = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
    const created = new Date(trade.created_at);

    const minutesSinceUpdate = lastUpdate
      ? Math.floor((now.getTime() - lastUpdate.getTime()) / 1000 / 60)
      : null;

    console.log(`Trade ID: ${trade.id}`);
    console.log(`  Option:     ${trade.polygon_option_ticker || 'N/A'}`);
    console.log(`  Underlying: ${trade.polygon_underlying_index_ticker || 'N/A'}`);
    console.log(`  Contract Price: $${trade.current_contract || 'N/A'}`);
    console.log(`  Underlying Price: $${trade.current_underlying || 'N/A'}`);
    console.log(`  Created: ${created.toISOString()}`);

    if (lastUpdate) {
      console.log(`  Last Update: ${lastUpdate.toISOString()}`);
      console.log(`  Time Since Update: ${minutesSinceUpdate} minutes`);

      if (minutesSinceUpdate! > 5) {
        console.log(`  ⚠️  WARNING: No update in ${minutesSinceUpdate} minutes`);
      } else {
        console.log(`  ✅ Recently updated`);
      }
    } else {
      console.log(`  Last Update: NEVER`);
      console.log(`  ❌ Trade has never been updated!`);
    }

    console.log('');
  }

  // Check cron job status
  console.log('='.repeat(70));
  console.log('CHECKING CRON JOB STATUS');
  console.log('='.repeat(70));

  const { data: cronJobs } = await supabase
    .from('cron.job')
    .select('*')
    .eq('jobname', 'indices-trade-tracker');

  if (cronJobs && cronJobs.length > 0) {
    console.log('Cron Job Found:');
    console.log(JSON.stringify(cronJobs[0], null, 2));
  } else {
    console.log('❌ Cron job not found!');
  }

  // Check recent cron runs
  const { data: cronRuns } = await supabase
    .from('cron.job_run_details')
    .select('*')
    .order('start_time', { ascending: false })
    .limit(5);

  if (cronRuns && cronRuns.length > 0) {
    console.log('\nRecent Cron Runs:');
    for (const run of cronRuns) {
      console.log(`  ${run.start_time}: ${run.status} (${run.return_message || 'no message'})`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
