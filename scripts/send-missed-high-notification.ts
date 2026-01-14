import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sendMissedHighNotification() {
  console.log('=== Sending Missed High Notification ===\n');

  // Get the current trade with all details
  const { data: trade, error: tradeError } = await supabase
    .from('index_trades')
    .select(`
      *,
      analysis:index_analyses!analysis_id(
        id,
        title,
        index_symbol,
        telegram_channel_id
      ),
      author:profiles!author_id(
        id,
        full_name,
        avatar_url
      )
    `)
    .eq('polygon_option_ticker', 'O:SPXW260114P06870000')
    .single();

  if (tradeError || !trade) {
    console.error('Error fetching trade:', tradeError);
    return;
  }

  console.log('Trade found:', trade.id);
  console.log('Option:', trade.polygon_option_ticker);
  console.log('High:', trade.contract_high_since);
  console.log('');

  const entryPrice = trade.entry_contract_snapshot?.mid || 4.05;
  const highPrice = trade.contract_high_since || 8.20;
  const gainPercent = ((highPrice - entryPrice) / entryPrice * 100).toFixed(2);

  console.log('Entry Price:', entryPrice);
  console.log('High Price:', highPrice);
  console.log('Gain:', gainPercent + '%');
  console.log('');

  // Get the channel ID
  const channelDbId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;

  if (!channelDbId) {
    console.error('No channel ID found!');
    return;
  }

  const { data: channel } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('id', channelDbId)
    .single();

  if (!channel) {
    console.error('Channel not found!');
    return;
  }

  console.log('Channel:', channel.name);
  console.log('Channel ID:', channel.channel_id);
  console.log('');

  // Create the notification payload
  const payload = {
    tradeId: trade.id,
    trade: {
      id: trade.id,
      polygon_option_ticker: trade.polygon_option_ticker,
      direction: trade.direction,
      strike: trade.strike,
      expiry: trade.expiry,
      qty: trade.qty,
      entry_contract_snapshot: trade.entry_contract_snapshot,
      current_contract: highPrice,
      contract_high_since: highPrice,
      analysis: {
        id: trade.analysis?.id,
        title: trade.analysis?.title,
        index_symbol: trade.analysis?.index_symbol,
      },
      author: {
        id: trade.author?.id,
        full_name: trade.author?.full_name,
        avatar_url: trade.author?.avatar_url,
      }
    },
    highPrice: highPrice,
    gainPercent: gainPercent,
  };

  console.log('Creating new_high notification...');

  // Insert into telegram_outbox
  const { data: message, error: insertError } = await supabase
    .from('telegram_outbox')
    .insert({
      message_type: 'new_high',
      channel_id: channel.channel_id,
      payload: payload,
      status: 'pending',
      priority: 5,
      max_retries: 3,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating message:', insertError);
    return;
  }

  console.log('✅ Message queued:', message.id);
  console.log('');

  // Trigger the outbox processor
  console.log('Triggering outbox processor...');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-outbox-processor`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const result = await response.json();
  console.log('Processor result:', JSON.stringify(result, null, 2));
  console.log('');

  // Check if message was sent
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { data: sentMessage } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('id', message.id)
    .single();

  console.log('Message status:', sentMessage?.status);
  if (sentMessage?.telegram_message_id) {
    console.log('✅ Telegram Message ID:', sentMessage.telegram_message_id);
    console.log('Message sent successfully!');
  } else if (sentMessage?.last_error) {
    console.log('❌ Error:', sentMessage.last_error);
  } else {
    console.log('Status:', sentMessage?.status);
  }
}

sendMissedHighNotification().catch(console.error);
