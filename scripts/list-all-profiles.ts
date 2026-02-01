import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function listAllProfiles() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total profiles: ${profiles?.length || 0}\n`);

  if (profiles) {
    profiles.forEach(p => {
      console.log(`ID: ${p.id}`);
      console.log(`  Name: ${p.full_name || 'N/A'}`);
      console.log(`  Username: ${p.username || 'N/A'}`);
      console.log(`  Email: ${p.email || 'N/A'}`);
      console.log(`  Role ID: ${p.role_id}`);
      console.log('');
    });
  }

  // Now check trades and their authors
  console.log('\n=== Checking recent trades ===');
  const { data: trades } = await supabase
    .from('index_trades')
    .select('id, author_id, strike, option_type, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (trades) {
    for (const trade of trades) {
      console.log(`Trade: ${trade.strike} ${trade.option_type}`);
      console.log(`  Author ID: ${trade.author_id}`);
      console.log(`  Created: ${trade.created_at}`);

      const profile = profiles?.find(p => p.id === trade.author_id);
      if (profile) {
        console.log(`  Author: ${profile.full_name || profile.username || 'Unknown'}`);
      } else {
        console.log(`  Author: Profile not found!`);
      }
      console.log('');
    }
  }
}

listAllProfiles();
