import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function upgradeToAnalyzer() {
  try {
    const email = process.argv[2];

    if (!email) {
      console.error('\n❌ Please provide an email address');
      console.log('\nUsage: npm run upgrade:analyzer <email>');
      console.log('Example: npm run upgrade:analyzer user@example.com\n');
      process.exit(1);
    }

    console.log('\n🔍 Finding user:', email);

    const { data: authUser } = await supabase.auth.admin.listUsers();
    const user = authUser?.users?.find(u => u.email === email);

    if (!user) {
      console.error('\n❌ User not found with email:', email);
      process.exit(1);
    }

    console.log('✅ User found:', user.id);

    console.log('\n🔍 Getting Analyzer role ID...');
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name')
      .eq('name', 'Analyzer')
      .single();

    if (roleError || !role) {
      console.error('\n❌ Failed to get Analyzer role:', roleError);
      process.exit(1);
    }

    console.log('✅ Analyzer role ID:', role.id);

    console.log('\n📝 Updating user profile to Analyzer...');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role_id: role.id })
      .eq('id', user.id);

    if (updateError) {
      console.error('\n❌ Failed to update role:', updateError);
      process.exit(1);
    }

    console.log('\n✅ SUCCESS! User upgraded to Analyzer');
    console.log('\n📋 User Details:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', email);
    console.log('User ID:', user.id);
    console.log('New Role: Analyzer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🔄 Please log out and log back in to see the changes!\n');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

upgradeToAnalyzer();
