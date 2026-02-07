import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function triggerTelegramSend() {
  console.log('=== Triggering Telegram Sender Edge Function ===\n');

  // Get the pending message
  const { data: message } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('status', 'pending')
    .eq('message_type', 'new_high')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!message) {
    console.log('No pending new_high messages found');
    return;
  }

  console.log('Found pending message:', message.id);
  console.log('Type:', message.message_type);
  console.log('Channel:', message.channel_id);
  console.log('');

  // Call telegram-sender edge function with specific message ID
  console.log('Calling telegram-sender edge function...');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-sender`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageId: message.id,
      }),
    }
  );

  if (!response.ok) {
    console.error('❌ Edge function error:', response.status, response.statusText);
    const text = await response.text();
    console.error('Response:', text);
    return;
  }

  const result = await response.json();
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('');

  // Check message status after sending
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { data: updatedMessage } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('id', message.id)
    .single();

  console.log('Updated message status:', updatedMessage?.status);

  if (updatedMessage?.telegram_message_id) {
    console.log('✅ Telegram Message ID:', updatedMessage.telegram_message_id);
    console.log('');
    console.log('🎉 Notification sent successfully!');
    console.log('Check your Telegram channel: https://t.me/c/2607859974/' + updatedMessage.telegram_message_id);
  } else if (updatedMessage?.last_error) {
    console.log('❌ Error:', updatedMessage.last_error);
  } else {
    console.log('Status:', updatedMessage?.status);
  }
}

triggerTelegramSend().catch(console.error);
