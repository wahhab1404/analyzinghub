import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTestingChannels() {
  console.log('=== Testing Channels ===\n');

  const { data: testChannels, error } = await supabase
    .from('analyzer_testing_channels')
    .select('*');

  if (error) {
    console.error('Error fetching testing channels:', error);
    return;
  }

  if (!testChannels || testChannels.length === 0) {
    console.log('No testing channels configured yet.');
    console.log('\nYou can add one through the UI at: /dashboard/settings (Testing Channels tab)');
    return;
  }

  console.log(`Found ${testChannels.length} testing channel(s):\n`);
  testChannels.forEach(ch => {
    console.log(`Name: ${ch.channel_name}`);
    console.log(`Channel ID: ${ch.channel_id}`);
    console.log(`Owner: ${ch.owner_id}`);
    console.log(`Active: ${ch.is_active ? 'Yes' : 'No'}`);
    console.log('─'.repeat(60));
  });
}

checkTestingChannels().catch(console.error);
