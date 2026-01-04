import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkChannels(userId: string) {
  console.log(`\n🔍 Checking channels for user: ${userId}\n`);

  const { data: channels, error } = await supabase
    .from('telegram_channels')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error) {
    console.error('❌ Error fetching channels:', error.message);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('📭 No channels connected yet.');
    return;
  }

  console.log(`✅ Found ${channels.length} connected channel(s):\n`);

  channels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel.audience_type.toUpperCase()} Channel`);
    console.log(`   Name: ${channel.channel_name}`);
    console.log(`   Channel ID: ${channel.channel_id}`);
    console.log(`   Language: ${channel.broadcast_language || 'both'}`);
    console.log(`   Notify New Analysis: ${channel.notify_new_analysis ? '✓' : '✗'}`);
    console.log(`   Notify Target Hit: ${channel.notify_target_hit ? '✓' : '✗'}`);
    console.log(`   Notify Stop Hit: ${channel.notify_stop_hit ? '✓' : '✗'}`);
    console.log(`   Connected: ${new Date(channel.created_at).toLocaleString()}`);
    console.log('');
  });

  console.log('Available slots:');
  const types = ['public', 'followers', 'subscribers'];
  const connectedTypes = channels.map(c => c.audience_type);
  const availableTypes = types.filter(t => !connectedTypes.includes(t));

  if (availableTypes.length === 0) {
    console.log('   ✓ All channel types are connected');
  } else {
    availableTypes.forEach(type => {
      console.log(`   • ${type} - Available`);
    });
  }
}

// Get user ID from command line or prompt
const userId = process.argv[2];

if (!userId) {
  console.log('Usage: npm run check:channels <user-id>');
  console.log('\nTo find your user ID:');
  console.log('1. Log in to your account');
  console.log('2. Open browser console');
  console.log('3. Run: localStorage.getItem("sb-<your-project>-auth-token")');
  console.log('4. Copy the user ID from the token');
  process.exit(1);
}

checkChannels(userId);
