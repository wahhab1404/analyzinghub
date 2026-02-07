import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSPXTrades() {
  const { data, error } = await supabase
    .from('index_trades')
    .select('id, strike, entry_contract_snapshot, current_contract, contract_high_since, contract_low_since, status, created_at, expiry')
    .eq('underlying_index_symbol', 'SPX')
    .eq('option_type', 'call')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('📊 Recent SPX CALL trades:\n');
  data?.forEach(t => {
    const entry = t.entry_contract_snapshot?.mid || 0;
    console.log(`Strike: $${t.strike} [${t.status}] - Exp: ${t.expiry || 'N/A'}`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Entry: $${entry.toFixed(2)}, Current: $${(t.current_contract || 0).toFixed(2)}`);
    console.log(`  High: $${(t.contract_high_since || 0).toFixed(2)}, Low: $${(t.contract_low_since || 0).toFixed(2)}`);
    console.log(`  Created: ${new Date(t.created_at).toLocaleString()}\n`);
  });
}

checkSPXTrades().catch(console.error);
