import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get the author_id from today's trades
  const { data, error } = await supabase
    .from('index_trades')
    .select('author_id')
    .gte('published_at', '2026-01-30')
    .lte('published_at', '2026-01-30T23:59:59')
    .limit(1)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Analyst ID:', data.author_id);
}

main();
