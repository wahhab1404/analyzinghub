import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkCurrentTrade() {
  console.log('=== Current Active Trade Telegram Setup ===\n');

  const { data: trade } = await supabase
    .from('index_trades')
    .select(`
      *,
      analysis:index_analyses!analysis_id(
        id,
        title,
        index_symbol,
        telegram_channel_id
      )
    `)
    .eq('polygon_option_ticker', 'O:SPXW260114P06870000')
    .single();

  if (!trade) {
    console.log('Trade not found');
    return;
  }

  console.log('Trade ID:', trade.id);
  console.log('Option:', trade.polygon_option_ticker);
  console.log('Status:', trade.status);
  console.log('');

  console.log('Telegram Configuration:');
  console.log('  telegram_send_enabled:', trade.telegram_send_enabled);
  console.log('  telegram_channel_id (trade):', trade.telegram_channel_id || 'none');
  console.log('  telegram_channel_id (analysis):', trade.analysis?.telegram_channel_id || 'none');
  console.log('');

  const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;

  if (channelId) {
    console.log('Effective Channel ID:', channelId);

    // Check if this is a UUID (database ID) or actual channel ID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId)) {
      console.log('This is a database UUID, looking up actual channel...');

      const { data: channel } = await supabase
        .from('telegram_channels')
        .select('*')
        .eq('id', channelId)
        .single();

      if (channel) {
        console.log('Channel found:');
        console.log('  Name:', channel.name);
        console.log('  Actual Channel ID:', channel.channel_id);
        console.log('  Type:', channel.channel_type);
      } else {
        console.log('❌ Channel not found in database!');
      }
    } else {
      console.log('This is an actual Telegram channel ID');
    }
  } else {
    console.log('❌ No Telegram channel configured!');
  }

  console.log('');
  console.log('Price Data:');
  console.log('  Entry:', trade.entry_contract_snapshot?.mid || 'none');
  console.log('  Current:', trade.current_contract);
  console.log('  High:', trade.contract_high_since);
  console.log('  Low:', trade.contract_low_since);
  console.log('');

  // Check for any queued messages for this trade
  const { data: messages } = await supabase
    .from('telegram_outbox')
    .select('*')
    .or(`payload->>tradeId.eq.${trade.id},payload->trade->>id.eq.${trade.id}`)
    .order('created_at', { ascending: false });

  console.log('Telegram Messages for this trade:');
  console.log(`Found ${messages?.length || 0} messages\n`);

  for (const msg of messages || []) {
    console.log(`  ${msg.created_at}: ${msg.message_type} - ${msg.status}`);
  }

  if (!messages || messages.length === 0) {
    console.log('❌ No Telegram messages found for this trade!');
    console.log('');
    console.log('Reasons why:');
    console.log('  1. The trade tracker wasn\'t running when high of $8.20 occurred');
    console.log('  2. There was a 44-minute gap before tracking started');
    console.log('  3. The high was never recorded in database (contract_high_since)');
  }
}

checkCurrentTrade().catch(console.error);
