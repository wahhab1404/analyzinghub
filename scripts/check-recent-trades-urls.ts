import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTrades() {
  const { data: trades, error } = await supabase
    .from('index_trades')
    .select('id, polygon_option_ticker, contract_url, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent trades:\n');
  trades?.forEach(t => {
    console.log(`${t.polygon_option_ticker}`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Contract URL: ${t.contract_url || 'NULL'}`);
    console.log(`  Created: ${t.created_at}\n`);
  });
}

checkTrades().catch(console.error);
