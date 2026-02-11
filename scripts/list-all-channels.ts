import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function listChannels() {
  const { data: channels, error } = await supabase
    .from('telegram_channels')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nFound ${channels?.length || 0} Telegram channels:\n`);

  channels?.forEach(ch => {
    console.log('─'.repeat(80));
    console.log(`Name: ${ch.channel_name || 'Unnamed'}`);
    console.log(`Channel ID: ${ch.channel_id}`);
    console.log(`Type: ${ch.channel_type}`);
    console.log(`Owner: ${ch.owner_id}`);
    console.log(`Active: ${ch.is_active ? 'Yes' : 'No'}`);
    console.log(`Language: ${ch.channel_language || 'N/A'}`);
    console.log(`Auto-broadcast: ${ch.auto_broadcast_enabled ? 'Yes' : 'No'}`);
    console.log(`Created: ${ch.created_at}`);
    console.log('');
  });
}

listChannels().catch(console.error);
