/**
 * Diagnose why a specific trade isn't getting price updates
 *
 * This script checks:
 * 1. If the trade exists and is active
 * 2. When it was last updated
 * 3. If there are any error logs
 * 4. Manually triggers the trade tracker to see if it works
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseTrade(tradeIdOrOptionTicker?: string) {
  console.log('='.repeat(80));
  console.log('TRADE UPDATE DIAGNOSTICS');
  console.log('='.repeat(80));
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Get all active trades if no specific trade ID provided
  const query = supabase
    .from('index_trades')
    .select(`
      id,
      status,
      polygon_option_ticker,
      strike,
      option_type,
      current_contract,
      entry_contract_snapshot,
      last_quote_at,
      created_at,
      published_at
    `)
    .eq('status', 'active')
    .order('last_quote_at', { ascending: true, nullsFirst: true });

  if (tradeIdOrOptionTicker) {
    // Check if it's a UUID or ticker
    if (tradeIdOrOptionTicker.includes(':')) {
      query.eq('polygon_option_ticker', tradeIdOrOptionTicker);
    } else {
      query.eq('id', tradeIdOrOptionTicker);
    }
  }

  const { data: trades, error } = await query.limit(10);

  if (error) {
    console.error('❌ Error fetching trades:', error);
    return;
  }

  if (!trades || trades.length === 0) {
    console.log('❌ No active trades found');
    return;
  }

  console.log(`Found ${trades.length} active trade(s):\n`);

  for (const trade of trades) {
    console.log('─'.repeat(80));
    console.log(`Trade ID: ${trade.id}`);
    console.log(`Option: ${trade.polygon_option_ticker}`);
    console.log(`Strike: $${trade.strike} ${trade.option_type?.toUpperCase()}`);
    console.log(`Status: ${trade.status}`);
    console.log('');

    const entryPrice = trade.entry_contract_snapshot?.mid || 0;
    const currentPrice = trade.current_contract || 0;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = entryPrice ? ((priceChange / entryPrice) * 100).toFixed(2) : '0';

    console.log(`Entry Price: $${entryPrice.toFixed(4)}`);
    console.log(`Current Price: $${currentPrice.toFixed(4)}`);
    console.log(`Change: $${priceChange.toFixed(4)} (${priceChangePercent}%)`);
    console.log('');

    const now = new Date();
    const lastUpdate = trade.last_quote_at ? new Date(trade.last_quote_at) : null;
    const published = trade.published_at ? new Date(trade.published_at) : null;

    if (lastUpdate) {
      const minutesSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000 / 60);
      console.log(`Last Updated: ${lastUpdate.toISOString()} (${minutesSinceUpdate} minutes ago)`);

      if (minutesSinceUpdate > 5) {
        console.log('⚠️  WARNING: No updates in over 5 minutes!');
      } else {
        console.log('✅ Updated recently');
      }
    } else {
      console.log('⚠️  WARNING: Never updated since creation!');
    }

    if (published) {
      console.log(`Published: ${published.toISOString()}`);
    }
    console.log('');
  }

  // Check cron job status
  console.log('─'.repeat(80));
  console.log('CHECKING CRON JOB STATUS...\n');

  const { data: cronJobs, error: cronError } = await supabase
    .from('cron')
    .select('*')
    .ilike('jobname', '%indices-trade-tracker%');

  if (!cronError && cronJobs && cronJobs.length > 0) {
    console.log('✅ Cron job found:');
    cronJobs.forEach(job => {
      console.log(`  Name: ${job.jobname}`);
      console.log(`  Schedule: ${job.schedule}`);
      console.log(`  Active: ${job.active || 'unknown'}`);
    });
  } else {
    console.log('⚠️  Could not verify cron job status');
  }
  console.log('');

  // Manually trigger trade tracker
  console.log('─'.repeat(80));
  console.log('MANUALLY TRIGGERING TRADE TRACKER...\n');

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/indices-trade-tracker`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Trade tracker executed:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      const errorText = await response.text();
      console.error('❌ Trade tracker error:', errorText);
    }
  } catch (error) {
    console.error('❌ Failed to trigger trade tracker:', error);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Diagnosis complete. Checking updated trade data...\n');

  // Re-fetch trades to see if they were updated
  const { data: updatedTrades } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, current_contract, last_quote_at')
    .in('id', trades.map(t => t.id));

  if (updatedTrades) {
    for (const updated of updatedTrades) {
      const original = trades.find(t => t.id === updated.id);
      if (original) {
        const wasUpdated = original.last_quote_at !== updated.last_quote_at;
        const priceChanged = original.current_contract !== updated.current_contract;

        console.log(`Trade ${updated.polygon_option_ticker}:`);
        console.log(`  Price: $${original.current_contract} → $${updated.current_contract} ${priceChanged ? '✅ CHANGED' : '(no change)'}`);
        console.log(`  Last update: ${original.last_quote_at} → ${updated.last_quote_at} ${wasUpdated ? '✅ UPDATED' : '(no change)'}`);
        console.log('');
      }
    }
  }
}

// Get trade ID from command line args
const tradeIdOrTicker = process.argv[2];

diagnoseTrade(tradeIdOrTicker).catch(console.error);
