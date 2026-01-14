import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMessageStatus() {
  console.log('=== Checking Message Status ===\n');

  const { data: message } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('id', '8ddacf5c-bc1f-4c66-b6d5-0f35821b38f5')
    .single();

  if (!message) {
    console.log('Message not found');
    return;
  }

  console.log('Message ID:', message.id);
  console.log('Type:', message.message_type);
  console.log('Status:', message.status);
  console.log('Channel:', message.channel_id);
  console.log('Created:', message.created_at);
  console.log('');

  if (message.status === 'sent') {
    console.log('✅ Message was sent!');
    console.log('Sent at:', message.sent_at);
    console.log('Telegram Message ID:', message.telegram_message_id);
  } else if (message.status === 'failed') {
    console.log('❌ Message failed');
    console.log('Failed at:', message.failed_at);
    console.log('Error:', message.last_error);
    console.log('');
    console.log('Retry count:', message.retry_count);
  } else {
    console.log('Status:', message.status);
    console.log('Next retry:', message.next_retry_at);
  }

  // Create a new message instead
  if (message.status === 'failed') {
    console.log('');
    console.log('Creating a new message to retry...');

    const payload = message.payload;

    const { data: newMessage, error } = await supabase
      .from('telegram_outbox')
      .insert({
        message_type: 'new_high',
        channel_id: message.channel_id,
        payload: payload,
        status: 'pending',
        priority: 5,
        max_retries: 3,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating new message:', error);
      return;
    }

    console.log('✅ New message created:', newMessage.id);
    console.log('');
    console.log('Now call the outbox processor edge function:');
    console.log(`curl -X POST "${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/telegram-outbox-processor" \\`);
    console.log(`  -H "Authorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20)}..." \\`);
    console.log(`  -H "Content-Type: application/json"`);
  }
}

checkMessageStatus().catch(console.error);
