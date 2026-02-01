import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testReportForJan30() {
  try {
    // Get user ID
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .limit(1);

    if (!profiles || profiles.length === 0) {
      console.log('No profiles found');
      return;
    }

    const analyst_id = profiles[0].id;
    console.log('Testing with analyst:', profiles[0].full_name, analyst_id);

    // Test with January 30, 2026
    const reportDate = '2026-01-30';
    console.log('Report date:', reportDate);

    const startOfDay = new Date(reportDate + 'T00:00:00.000Z');
    const endOfDay = new Date(reportDate + 'T23:59:59.999Z');

    console.log('Start of day:', startOfDay.toISOString());
    console.log('End of day:', endOfDay.toISOString());

    // Fetch all trades
    const { data: allTradesFromDB, error: tradesError } = await supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analyst_id)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
      return;
    }

    console.log(`\nTotal trades from DB: ${allTradesFromDB?.length || 0}`);

    // Filter trades
    const trades = (allTradesFromDB || []).filter(t => {
      const createdAt = new Date(t.created_at);
      const closedAt = t.closed_at ? new Date(t.closed_at) : null;
      const expiryDate = t.expiry ? new Date(t.expiry) : null;

      const matchCreated = createdAt >= startOfDay && createdAt <= endOfDay;
      const matchClosed = closedAt && closedAt >= startOfDay && closedAt <= endOfDay;
      const matchExpiry = expiryDate && expiryDate >= startOfDay && expiryDate <= endOfDay;
      const matchActive = t.status === 'active' && createdAt <= endOfDay;

      return matchCreated || matchClosed || matchExpiry || matchActive;
    });

    console.log(`\nFiltered trades for January 30: ${trades.length}`);
    trades.forEach(t => {
      console.log(`  - ${t.strike} ${t.option_type}: ${t.id} (Created: ${t.created_at})`);
    });

    // Now test the actual edge function
    console.log('\n\n=== Testing Edge Function ===');
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-advanced-daily-report`;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        date: reportDate,
        analyst_id: analyst_id,
        language_mode: 'dual',
        period_type: 'daily',
        dry_run: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Edge function error:', error);
      return;
    }

    const result = await response.json();
    console.log('\nEdge function result:');
    console.log('Success:', result.success);
    console.log('Metrics:', result.metrics);
    console.log('Trades count:', result.trades?.length || 0);
    if (result.trades && result.trades.length > 0) {
      console.log('\nTrades:');
      result.trades.forEach((t: any) => {
        console.log(`  - ${t.symbol} ${t.type} Strike: ${t.strike} Entry: ${t.entry_price} High: ${t.highest_price}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testReportForJan30();
