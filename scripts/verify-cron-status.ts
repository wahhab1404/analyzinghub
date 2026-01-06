import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verifyIndicesTradeTracker() {
  console.log('\n=== Verifying Indices Trade Tracker Cron Job ===\n');

  // 1. Check if edge function exists
  console.log('1. Checking if edge function is deployed...');
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/indices-trade-tracker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Edge function is deployed and responding');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Edge function returned error:', response.status);
      const text = await response.text();
      console.log('Error:', text);
    }
  } catch (error) {
    console.log('❌ Failed to reach edge function:', error);
  }

  // 2. Check for active trades
  console.log('\n2. Checking for active trades...');
  const { data: activeTrades, error: tradesError } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, current_contract, last_quote_at')
    .eq('status', 'active')
    .order('last_quote_at', { ascending: false })
    .limit(5);

  if (tradesError) {
    console.log('❌ Error fetching trades:', tradesError);
  } else if (!activeTrades || activeTrades.length === 0) {
    console.log('⚠️  No active trades found');
    console.log('The cron job will not do anything until you have active trades');
  } else {
    console.log(`✅ Found ${activeTrades.length} active trades`);
    console.log('\nMost recently updated trades:');
    activeTrades.forEach((trade, i) => {
      const lastUpdate = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
      const minutesAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 60000) : null;
      console.log(`  ${i + 1}. Trade ${trade.id}`);
      console.log(`     Contract: ${trade.polygon_option_ticker || 'N/A'}`);
      console.log(`     Current Price: $${trade.current_contract}`);
      console.log(`     Last Updated: ${lastUpdate ? lastUpdate.toLocaleString() : 'Never'} ${minutesAgo !== null ? `(${minutesAgo} min ago)` : ''}`);
    });
  }

  // 3. Check cron job configuration
  console.log('\n3. Checking cron job configuration...');
  const { data: cronJobs, error: cronError } = await supabase
    .rpc('pg_cron_jobs' as any)
    .then(() => null)
    .catch(() => null);

  console.log('ℹ️  To check cron job status, run this SQL in Supabase SQL Editor:');
  console.log(`
-- Check if cron job exists
SELECT * FROM cron.job WHERE jobname LIKE '%trade%';

-- Check recent cron job runs
SELECT
  j.jobname,
  jr.runid,
  jr.status,
  jr.start_time,
  jr.end_time,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname LIKE '%trade%'
ORDER BY jr.start_time DESC
LIMIT 10;
  `);

  // 4. Test direct function invocation
  console.log('\n4. Testing direct function invocation...');
  console.log('Calling the edge function directly...');

  try {
    const testResponse = await fetch(`${supabaseUrl}/functions/v1/indices-trade-tracker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (testResponse.ok) {
      const result = await testResponse.json();
      console.log('✅ Function executed successfully!');
      console.log('Results:', JSON.stringify(result, null, 2));

      if (result.updated > 0) {
        console.log(`\n🎉 SUCCESS! Updated ${result.updated} trades`);
      } else if (result.processed === 0) {
        console.log('\n⚠️  No active trades to process');
      } else {
        console.log(`\n✅ Processed ${result.processed} trades`);
      }
    } else {
      console.log('❌ Function call failed:', testResponse.status);
      const errorText = await testResponse.text();
      console.log('Error:', errorText);
    }
  } catch (error) {
    console.log('❌ Error calling function:', error);
  }

  console.log('\n=== Verification Complete ===\n');
  console.log('Summary:');
  console.log('- Edge function deployed: Check logs above');
  console.log('- Active trades: Check count above');
  console.log('- Cron job: Run SQL queries shown above in Supabase SQL Editor');
  console.log('\nIf trades are being updated recently (within last few minutes),');
  console.log('then the cron job is working correctly!');
}

verifyIndicesTradeTracker().catch(console.error);
