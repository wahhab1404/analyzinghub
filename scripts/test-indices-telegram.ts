import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('SUPABASE_URL:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function testIndicesTelegram() {
  console.log('🔍 Testing Indices Telegram Publisher...\n');

  // Step 1: Check if edge function exists
  console.log('Step 1: Checking edge function deployment...');
  try {
    const testResponse = await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        type: 'test',
        data: {}
      }),
    });

    if (testResponse.status === 404) {
      console.log('❌ Edge function NOT deployed!');
      console.log('\nTo deploy, run:');
      console.log('npx supabase functions deploy indices-telegram-publisher');
      return;
    }

    console.log(`✅ Edge function exists (status: ${testResponse.status})`);
  } catch (error: any) {
    console.error('❌ Error checking edge function:', error.message);
    return;
  }

  // Step 2: Get most recent active trade
  console.log('\nStep 2: Fetching recent trade...');
  const { data: trades, error: tradesError } = await supabase
    .from('index_trades')
    .select(`
      *,
      author:profiles!author_id(id, full_name, avatar_url),
      analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);

  if (tradesError || !trades || trades.length === 0) {
    console.log('❌ No active trades found');
    console.log('Create a trade first in Indices Hub');
    return;
  }

  const trade = trades[0];
  console.log(`✅ Found trade: ${trade.id}`);
  console.log(`   Symbol: ${trade.analysis.index_symbol}`);
  console.log(`   Direction: ${trade.direction}`);
  console.log(`   Telegram Channel: ${trade.telegram_channel_id || trade.analysis.telegram_channel_id || 'None'}`);

  // Step 3: Check telegram channels
  console.log('\nStep 3: Checking telegram channels...');
  const { data: channels, error: channelsError } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('user_id', trade.author_id)
    .eq('enabled', true);

  if (channelsError) {
    console.error('❌ Error fetching channels:', channelsError.message);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('❌ No enabled Telegram channels found for this user');
    console.log('Enable a Telegram channel in Settings first');
    return;
  }

  console.log(`✅ Found ${channels.length} enabled channel(s):`);
  channels.forEach(ch => {
    console.log(`   - ${ch.channel_name} (${ch.channel_id})`);
  });

  // Step 4: Test sending to edge function
  console.log('\nStep 4: Testing edge function call...');

  const channelId = trade.telegram_channel_id || trade.analysis.telegram_channel_id || channels[0].channel_id;

  console.log(`Using channel ID: ${channelId}`);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        type: 'new_trade',
        data: trade,
        channelId: channelId,
        isNewHigh: false,
      }),
    });

    const responseText = await response.text();
    console.log(`Response status: ${response.status}`);
    console.log(`Response body: ${responseText}`);

    if (response.ok) {
      console.log('\n✅ Successfully called edge function!');
      console.log('Check your Telegram channel for the message.');
    } else {
      console.log('\n❌ Edge function returned error');
      console.log('Check the error message above');
    }
  } catch (error: any) {
    console.error('❌ Error calling edge function:', error.message);
  }

  // Step 5: Check edge function logs hint
  console.log('\n💡 To see detailed logs:');
  console.log('1. Go to Supabase Dashboard');
  console.log('2. Navigate to Edge Functions > indices-telegram-publisher');
  console.log('3. Click on "Logs" tab');
  console.log('4. Look for [IndicesPublisher] entries');
}

testIndicesTelegram().catch(console.error);
