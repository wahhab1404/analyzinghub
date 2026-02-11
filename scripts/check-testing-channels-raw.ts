import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTestingChannels() {
  console.log('=== Testing Channels (Raw) ===\n');

  const { data: testChannels, error } = await supabase
    .from('analyzer_testing_channels')
    .select('*');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Raw data:', JSON.stringify(testChannels, null, 2));
}

checkTestingChannels().catch(console.error);
