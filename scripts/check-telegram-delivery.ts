import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDelivery() {
  console.log('=== Checking Telegram Message Delivery ===\n');

  // Get recent messages
  const { data: messages } = await supabase
    .from('telegram_outbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!messages || messages.length === 0) {
    console.log('No messages found in outbox');
    return;
  }

  console.log(`Found ${messages.length} recent messages:\n`);

  for (const msg of messages) {
    console.log('─'.repeat(80));
    console.log(`ID: ${msg.id}`);
    console.log(`Type: ${msg.message_type}`);
    console.log(`Status: ${msg.status}`);
    console.log(`Channel: ${msg.channel_id}`);
    console.log(`Created: ${msg.created_at}`);
    console.log(`Processed: ${msg.processed_at || 'Not processed'}`);

    if (msg.telegram_message_id) {
      console.log(`✅ Telegram Message ID: ${msg.telegram_message_id}`);
      console.log(`   Link: https://t.me/c/${msg.channel_id.replace('-100', '')}/${msg.telegram_message_id}`);
    } else {
      console.log(`⚠️  No Telegram message ID (message may not have been sent)`);
    }

    if (msg.error) {
      console.log(`❌ Error: ${msg.error}`);
    }

    if (msg.payload?.trade) {
      console.log(`Trade: ${msg.payload.trade.polygon_option_ticker}`);
      console.log(`Contract URL: ${msg.payload.trade.contract_url || 'none'}`);
    }

    console.log('');
  }

  // Check telegram channels configuration
  const { data: channels } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('channel_type', 'indices_hub');

  console.log('\n=== Telegram Channels Configuration ===\n');
  channels?.forEach(ch => {
    console.log(`Channel: ${ch.channel_name}`);
    console.log(`  ID: ${ch.channel_id}`);
    console.log(`  Type: ${ch.channel_type}`);
    console.log(`  Active: ${ch.is_active}`);
    console.log('');
  });
}

checkDelivery().catch(console.error);
