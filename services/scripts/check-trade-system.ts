import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTradeSystem() {
  console.log('=== Checking Trade Tracking System ===\n');

  // Check active trades
  const { data: trades, error: tradesError } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active');

  if (tradesError) {
    console.error('Error fetching trades:', tradesError);
    return;
  }

  console.log(`📊 Active trades: ${trades?.length || 0}`);
  if (trades && trades.length > 0) {
    trades.forEach(trade => {
      console.log(`  - Trade ${trade.id}: ${trade.polygon_option_ticker || 'No ticker'}`);
      console.log(`    Entry: $${trade.entry_contract}, Current: $${trade.current_contract || 'N/A'}`);
      console.log(`    Last quote: ${trade.last_quote_at || 'Never'}`);
    });
  }

  // Check cron job status
  const { data: cronJobs, error: cronError } = await supabase
    .from('cron.job')
    .select('*')
    .ilike('jobname', '%indices%');

  if (cronError) {
    console.error('\n❌ Error fetching cron jobs:', cronError);
  } else {
    console.log(`\n📅 Cron jobs found: ${cronJobs?.length || 0}`);
    if (cronJobs && cronJobs.length > 0) {
      cronJobs.forEach(job => {
        console.log(`  - ${job.jobname}: ${job.active ? '✅ Active' : '❌ Inactive'}`);
        console.log(`    Schedule: ${job.schedule}`);
      });
    }
  }

  // Test manual tracker call
  console.log('\n🔄 Testing manual tracker call...');
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/indices-trade-tracker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    console.log('Tracker response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error calling tracker:', error);
  }
}

checkTradeSystem().catch(console.error);
