import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getTradeOwner() {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, id')
    .eq('id', '39e2a757-8104-4166-9504-9c8c5534f56f')
    .single();

  console.log('Trade owner profile:', profile);

  // Also check current user (Borniface)
  const { data: currentUser } = await supabase
    .from('profiles')
    .select('full_name, username, id')
    .eq('id', '2d797cf2-ed76-4ba8-ae75-2578c5d072ca')
    .single();

  console.log('Current logged-in user:', currentUser);
}

getTradeOwner();
