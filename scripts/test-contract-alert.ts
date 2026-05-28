/**
 * test-contract-alert.ts — Send TEST contract alerts (new trade + new high) to
 * Telegram through the real production pipeline so you can verify the image is
 * attached.
 *
 * It creates a throw-away test trade (is_testing = true, excluded from stats),
 * queues a `new_trade` and a `new_high` message into telegram_outbox with
 * isTestingMode = true, then triggers the telegram-outbox-processor edge
 * function to flush them immediately.
 *
 * Channel resolution (first match wins):
 *   1. CLI flag:      npm run test:contract-alert -- --channel <telegram_chat_id>
 *   2. Env var:       TEST_TELEGRAM_CHANNEL_ID=<telegram_chat_id>
 *   3. First enabled row in analyzer_testing_channels
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function resolveChannelId(): Promise<string | null> {
  const flagIdx = process.argv.indexOf('--channel');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) {
    return process.argv[flagIdx + 1];
  }
  if (process.env.TEST_TELEGRAM_CHANNEL_ID) {
    return process.env.TEST_TELEGRAM_CHANNEL_ID;
  }
  const { data } = await supabase
    .from('analyzer_testing_channels')
    .select('telegram_channel_id, name')
    .eq('is_enabled', true)
    .limit(1);
  return data?.[0]?.telegram_channel_id ?? null;
}

async function main() {
  console.log('🧪 Test Contract Alert — verifying Telegram image delivery\n');

  const channelId = await resolveChannelId();
  if (!channelId) {
    console.error('❌ No testing channel found.');
    console.error('   Provide one via:  npm run test:contract-alert -- --channel <telegram_chat_id>');
    console.error('   or set TEST_TELEGRAM_CHANNEL_ID, or add a channel in Settings → Testing Channels.');
    process.exit(1);
  }
  console.log(`📡 Target Telegram channel: ${channelId}`);

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name')
    .limit(1);

  if (!users || users.length === 0) {
    console.error('❌ No profiles found to use as the trade author');
    process.exit(1);
  }
  const author = users[0];
  console.log(`👤 Author: ${author.full_name ?? author.id}\n`);

  // ── Build a realistic test contract ──────────────────────────────────────────
  const entry = 3.50;
  const high = 9.40;
  const current = high;
  const strike = 6900;

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  const expiryStr = expiry.toISOString().split('T')[0];

  const entrySnapshot = {
    price: entry,
    mid: entry,
    last: entry,
    bid: entry - 0.05,
    ask: entry + 0.05,
    volume: 1250,
    open_interest: 5400,
    timestamp: new Date().toISOString(),
  };

  console.log('Creating test trade...');
  const { data: trade, error: insertError } = await supabase
    .from('index_trades')
    .insert({
      author_id: author.id,
      underlying_index_symbol: 'SPX',
      polygon_option_ticker: `O:SPX${expiryStr.replace(/-/g, '').slice(2)}C0${strike}000`,
      strike,
      direction: 'call',
      option_type: 'call',
      expiry: expiryStr,
      entry_contract_snapshot: entrySnapshot,
      current_contract: current,
      contract_high_since: high,
      current_underlying: 6920,
      entry_underlying_snapshot: { price: 6885, timestamp: new Date().toISOString() },
      targets: [{ level: 6.0 }, { level: 9.0 }],
      stoploss: { level: 2.0 },
      status: 'active',
      qty: 1,
      contract_multiplier: 100,
      is_manual_entry: true,
      is_testing: true,
      telegram_send_enabled: true,
    })
    .select()
    .single();

  if (insertError || !trade) {
    console.error('❌ Failed to create test trade:', insertError);
    process.exit(1);
  }
  console.log(`✅ Test trade created: ${trade.id}\n`);

  // The image generator reads author + analysis off the payload trade object.
  const tradeForPayload = {
    ...trade,
    author: { id: author.id, full_name: author.full_name },
    analysis: { id: trade.id, title: 'Test Trade', index_symbol: 'SPX' },
  };

  console.log('Queuing new_trade + new_high alerts to telegram_outbox...');
  const { error: queueError } = await supabase.from('telegram_outbox').insert([
    {
      message_type: 'new_trade',
      payload: { trade: tradeForPayload, isTestingMode: true },
      channel_id: channelId,
      status: 'pending',
      priority: 5,
      next_retry_at: new Date().toISOString(),
    },
    {
      message_type: 'new_high',
      payload: { trade: tradeForPayload, highPrice: high, isTestingMode: true },
      channel_id: channelId,
      status: 'pending',
      priority: 5,
      next_retry_at: new Date().toISOString(),
    },
  ]);

  if (queueError) {
    console.error('❌ Failed to queue outbox messages:', queueError);
    process.exit(1);
  }
  console.log('✅ Queued 2 messages\n');

  console.log('Triggering telegram-outbox-processor...');
  const res = await fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ triggered_by: 'test-contract-alert' }),
  });

  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log('✅ Processor completed:', JSON.stringify(body));
    console.log('\n📲 Check your Telegram testing channel — you should see TWO messages,');
    console.log('   each WITH an attached contract image (TEST · NEW TRADE and TEST · NEW HIGH).');
  } else {
    console.error(`❌ Processor returned ${res.status}:`, JSON.stringify(body));
  }

  console.log(`\n🧹 Test trade id (delete when done): ${trade.id}`);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
