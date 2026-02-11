import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('Updating next_retry_at for pending messages...');
  
  const { data: updated, error } = await supabase
    .from('telegram_outbox')
    .update({ next_retry_at: new Date().toISOString() })
    .eq('status', 'pending')
    .is('next_retry_at', null)
    .select('id');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Updated', updated?.length || 0, 'messages');
  
  console.log('\nTriggering outbox processor...');
  
  const response = await fetch(
    process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/telegram-outbox-processor',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const result = await response.json();
  console.log('Result:', JSON.stringify(result, null, 2));
})();
