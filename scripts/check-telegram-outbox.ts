import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOutbox() {
  console.log('=== Checking Telegram Outbox ===\n');

  const { data: messages, error } = await supabase
    .from('telegram_outbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${messages?.length || 0} recent messages:\n`);

  for (const msg of messages || []) {
    console.log('─'.repeat(80));
    console.log(`ID: ${msg.id}`);
    console.log(`Type: ${msg.message_type}`);
    console.log(`Channel: ${msg.channel_id}`);
    console.log(`Status: ${msg.status}`);
    console.log(`Priority: ${msg.priority}`);
    console.log(`Created: ${msg.created_at}`);
    console.log(`Retries: ${msg.retry_count || 0}`);

    if (msg.payload?.trade) {
      const trade = msg.payload.trade;
      console.log(`Trade: ${trade.polygon_option_ticker}`);
      console.log(`Contract URL: ${trade.contract_url || 'none'}`);
    }

    if (msg.error) {
      console.log(`Error: ${msg.error}`);
    }

    console.log('');
  }
}

checkOutbox().catch(console.error);
