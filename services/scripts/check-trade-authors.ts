import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTradeAuthors() {
  try {
    // Get ALL trades without filtering by author
    const { data: allTrades, error: tradesError } = await supabase
      .from('index_trades')
      .select('id, author_id, strike, option_type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
      return;
    }

    console.log(`Total trades found: ${allTrades?.length || 0}`);

    if (allTrades && allTrades.length > 0) {
      console.log('\nRecent trades:');
      for (const trade of allTrades) {
        console.log(`\nTrade ID: ${trade.id}`);
        console.log(`  Strike: ${trade.strike} ${trade.option_type}`);
        console.log(`  Status: ${trade.status}`);
        console.log(`  Created at: ${trade.created_at}`);
        console.log(`  Author ID: ${trade.author_id}`);

        // Get author profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', trade.author_id)
          .single();

        if (profile) {
          console.log(`  Author: ${profile.full_name || profile.username}`);
        }
      }
    }

    // Also get all profiles
    console.log('\n\n=== All Profiles ===');
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .limit(10);

    if (profiles) {
      profiles.forEach(p => {
        console.log(`${p.full_name || p.username}: ${p.id}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkTradeAuthors();
