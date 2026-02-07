const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const tradeId = '40941e87-9219-4089-9606-ba63c9ee34de';

  const { data: trade, error } = await supabase
    .from('index_trades')
    .select('*, author:profiles!author_id(id, full_name, avatar_url), analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)')
    .eq('id', tradeId)
    .single();

  if (error) {
    console.error('Error fetching trade:', error);
    return;
  }

  console.log('Trade:', {
    id: trade.id,
    strike: trade.strike,
    entry: trade.entry_contract_snapshot?.mid,
    current: trade.current_contract,
    high: trade.contract_high_since,
    profit: trade.profit_from_entry + '%'
  });

  console.log('\nGenerating snapshot...');
  const snapshotUrl = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/generate-trade-snapshot';
  const snapshotRes = await fetch(snapshotUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tradeId: tradeId,
      isNewHigh: true,
      newHighPrice: parseFloat(trade.contract_high_since)
    })
  });

  let imageUrl = null;
  if (snapshotRes.ok) {
    const snapshotData = await snapshotRes.json();
    imageUrl = snapshotData.imageUrl;
    console.log('✅ Snapshot generated:', imageUrl);

    await supabase
      .from('index_trades')
      .update({ contract_url: imageUrl })
      .eq('id', tradeId);
  } else {
    console.error('❌ Snapshot generation failed:', await snapshotRes.text());
  }

  const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;

  if (!channelId) {
    console.log('⚠️ No channel ID found');
    return;
  }

  const { data: channel } = await supabase
    .from('telegram_channels')
    .select('channel_id')
    .eq('id', channelId)
    .single();

  const actualChannelId = channel?.channel_id || channelId;

  console.log('\n📤 Queueing Telegram message to channel:', actualChannelId);

  const { data: msg, error: msgError } = await supabase
    .from('telegram_outbox')
    .insert({
      message_type: 'new_high',
      payload: {
        tradeId: trade.id,
        highPrice: parseFloat(trade.contract_high_since),
        gainPercent: parseFloat(trade.profit_from_entry),
        snapshotUrl: imageUrl,
        trade: trade
      },
      channel_id: actualChannelId,
      status: 'pending',
      priority: 5,
      next_retry_at: new Date().toISOString()
    })
    .select()
    .single();

  if (msgError) {
    console.error('❌ Error queuing message:', msgError);
  } else {
    console.log('✅ Message queued:', msg.id);

    console.log('\n📨 Sending to Telegram...');
    const processorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/telegram-outbox-processor';
    const processorRes = await fetch(processorUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });

    const processorData = await processorRes.json();
    console.log('✅ Processor result:', processorData);
  }
})();
