import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function simulateNewHigh() {
  console.log('=== Simulating New High ===\n');

  const { data: trade } = await supabase
    .from('index_trades')
    .select('*')
    .eq('status', 'active')
    .single();

  if (!trade) {
    console.log('No active trade found');
    return;
  }

  console.log('Trade:', trade.polygon_option_ticker);
  console.log('Current Price:', trade.current_contract);
  console.log('Current High:', trade.contract_high_since);
  console.log('');

  // Simulate a price that's higher than current high
  const newPrice = (trade.contract_high_since || 4.05) + 0.50; // $8.70 if high is $8.20

  console.log('Simulating new price:', newPrice);
  console.log('This should trigger a new high notification!');
  console.log('');

  // Update current_contract to trigger new high
  const { error } = await supabase
    .from('index_trades')
    .update({
      current_contract: newPrice,
      last_quote_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago to trigger update
    })
    .eq('id', trade.id);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('✅ Price updated to trigger new high detection');
  console.log('');
  console.log('Now triggering trade tracker...');
  console.log('');

  // Trigger trade tracker
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/indices-trade-tracker`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = await response.json();
  console.log('Trade tracker result:', JSON.stringify(result, null, 2));
  console.log('');

  // Check for new telegram messages
  console.log('Checking Telegram outbox for new high notification...');
  const { data: messages } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('message_type', 'new_high')
    .order('created_at', { ascending: false })
    .limit(1);

  if (messages && messages.length > 0) {
    console.log('✅ New high notification queued!');
    console.log('Message:', JSON.stringify(messages[0], null, 2));
  } else {
    console.log('❌ No new high notification found');
    console.log('Check the results above for why it might not have been triggered');
  }
}

simulateNewHigh().catch(console.error);
