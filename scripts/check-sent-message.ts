import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMessage() {
  const { data } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('id', 'ef6cc881-fd83-471c-a36f-789e454859b0')
    .single();

  if (!data) {
    console.log('Message not found');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Message ID:', data.id);
  console.log('Status:', data.status);
  console.log('Channel:', data.channel_id);
  console.log('Type:', data.message_type);
  console.log('\nPayload:');
  console.log(JSON.stringify(data.payload, null, 2));
  console.log('═══════════════════════════════════════════════════════════');
}

checkMessage();
