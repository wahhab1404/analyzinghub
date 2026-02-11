import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data } = await supabase
    .from('telegram_outbox')
    .select('id, status, next_retry_at, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(3);
  
  console.log('Pending messages:');
  data?.forEach(m => {
    console.log('  ID:', m.id.substring(0, 8));
    console.log('  next_retry_at:', m.next_retry_at);
    console.log('  created_at:', m.created_at);
    console.log('---');
  });
})();
