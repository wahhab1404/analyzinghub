import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resendTrade(tradeId: string) {
  console.log('Fetching trade:', tradeId);
  
  const { data: trade, error } = await supabase
    .from('index_trades')
    .select('*, author:profiles!author_id(id, full_name, avatar_url)')
    .eq('id', tradeId)
    .single();
  
  if (error || !trade) {
    throw new Error('Trade not found: ' + (error?.message || 'unknown'));
  }
  
  console.log('Trade:', trade.polygon_option_ticker);
  console.log('Contract URL:', trade.contract_url || 'NONE');
  console.log('Is Testing:', trade.is_testing);
  
  const { data: testChannel } = await supabase
    .from('analyzer_testing_channels')
    .select('*')
    .eq('user_id', trade.author_id)
    .eq('is_enabled', true)
    .maybeSingle();
  
  if (!testChannel) {
    throw new Error('No testing channel found for user');
  }
  
  console.log('Sending to channel:', testChannel.name, testChannel.telegram_channel_id);
  
  const { error: outboxError } = await supabase
    .from('telegram_outbox')
    .insert({
      message_type: 'new_trade',
      channel_id: testChannel.telegram_channel_id,
      payload: { trade },
      priority: 5,
      status: 'pending'
    });
  
  if (outboxError) {
    throw new Error('Failed to add to outbox: ' + outboxError.message);
  }
  
  console.log('Added to telegram outbox');
}

const tradeIds = [
  '0bf20ee3-cc1f-4035-94c7-4c63c24e24b6',
  '5758a3e3-48f6-45f9-95d7-0ebfd33d3fe9'
];

(async () => {
  for (const id of tradeIds) {
    console.log('\n' + '='.repeat(60));
    try {
      await resendTrade(id);
      console.log('Success!');
    } catch (error: any) {
      console.error('Error:', error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\nNow processing outbox...');
  
  const response = await fetch(
    process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/telegram-outbox-processor',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const result = await response.json();
  console.log('Outbox processor result:', result);
})();
