import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testReportQuery() {
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

    // Use today's date
    const reportDate = new Date().toISOString().split('T')[0];
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

      console.log(`\nTrade ${t.strike} ${t.option_type}:`);
      console.log('  Created at:', t.created_at);
      console.log('  Created (parsed):', createdAt.toISOString());
      console.log('  Status:', t.status);
      console.log('  Match created:', matchCreated);
      console.log('  Match closed:', matchClosed);
      console.log('  Match expiry:', matchExpiry);
      console.log('  Match active:', matchActive);
      console.log('  Overall match:', matchCreated || matchClosed || matchExpiry || matchActive);

      return matchCreated || matchClosed || matchExpiry || matchActive;
    });

    console.log(`\n\nFiltered trades for period: ${trades.length}`);
    console.log('Trade IDs:');
    trades.forEach(t => {
      console.log(`  - ${t.strike} ${t.option_type}: ${t.id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testReportQuery();
