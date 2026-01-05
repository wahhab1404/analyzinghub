import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function checkCronStatus() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('Checking cron job status...\n');

  // Check if pg_cron extension is enabled
  const { data: extensions, error: extError } = await supabase
    .from('pg_extension')
    .select('*')
    .eq('extname', 'pg_cron')
    .maybeSingle();

  if (extError) {
    console.log('❌ Error checking extensions:', extError.message);
  } else if (extensions) {
    console.log('✅ pg_cron extension is enabled');
  } else {
    console.log('❌ pg_cron extension is NOT enabled');
  }

  // Try to check cron jobs
  try {
    const { data: jobs, error: jobsError } = await supabase.rpc('execute_sql', {
      query: "SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname LIKE 'indices%'"
    });

    if (jobsError) {
      console.log('\nℹ️  Could not query cron jobs directly (expected)');
      console.log('   Trying alternative method...');

      // Alternative: use direct SQL query
      const { data, error } = await supabase.from('cron.job').select('*');
      if (error) {
        console.log('   ❌ Cannot access cron.job table:', error.message);
      } else {
        console.log('   ✅ Found', data?.length || 0, 'cron jobs');
      }
    } else {
      console.log('\n✅ Cron jobs found:');
      console.log(JSON.stringify(jobs, null, 2));
    }
  } catch (e: any) {
    console.log('\nℹ️  Cron job query not accessible via client (this is normal)');
  }

  // Check recent trade updates to see if cron is working
  const { data: recentTrades, error: tradesError } = await supabase
    .from('index_trades')
    .select('id, last_quote_at, current_contract, status')
    .eq('status', 'active')
    .order('last_quote_at', { ascending: false, nullsFirst: false })
    .limit(5);

  if (tradesError) {
    console.log('\n❌ Error fetching trades:', tradesError.message);
  } else if (recentTrades && recentTrades.length > 0) {
    console.log('\n✅ Recent active trades:');
    recentTrades.forEach((trade: any) => {
      const lastUpdate = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
      const minutesAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000 / 60) : null;
      console.log(`   - Trade ${trade.id.substring(0, 8)}`);
      console.log(`     Last updated: ${lastUpdate ? lastUpdate.toLocaleString() : 'never'} ${minutesAgo !== null ? `(${minutesAgo} min ago)` : ''}`);
      console.log(`     Current price: $${trade.current_contract}`);
    });

    // Check if any trade was updated in the last 2 minutes
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
    const recentUpdates = recentTrades.filter((t: any) =>
      t.last_quote_at && new Date(t.last_quote_at).getTime() > twoMinutesAgo
    );

    if (recentUpdates.length > 0) {
      console.log(`\n✅ Cron appears to be working! ${recentUpdates.length} trade(s) updated in last 2 minutes`);
    } else {
      console.log(`\n⚠️  No trades updated in last 2 minutes. Cron may not be running.`);
    }
  } else {
    console.log('\nℹ️  No active trades found');
  }
}

checkCronStatus();
