import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';
import bcrypt from 'bcryptjs';

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

async function createUserDirectly() {
  try {
    const email = 'alnasserfahad333@gmail.com';
    const password = 'Ff0551187442';
    const fullName = 'Fahad Bin Saidan';

    console.log('\n🔐 Creating user directly in database...');
    console.log('Email:', email);

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed');

    // Get Analyzer role ID
    const roleId = '927c9931-7bb6-4848-842f-8243425ec6d5';

    // Generate a UUID for the user
    const { data: uuidData } = await supabase.rpc('gen_random_uuid' as any);
    const userId = crypto.randomUUID();

    console.log('User ID:', userId);

    // Check if user already exists in auth.users
    const { data: existingAuthUser } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingAuthUser) {
      console.log('\n⚠️  User already exists in profiles');
      console.log('User ID:', existingAuthUser.id);
      console.log('\nTrying to insert into auth.users...');

      // We can't directly insert into auth.users due to permissions
      // This confirms we need Supabase Auth API to work
      console.log('\n❌ Cannot bypass Supabase Auth API');
      console.log('The Auth service must be working to create users.');
      console.log('\nPlease contact Supabase support or:');
      console.log('1. Wait a few minutes for the service to recover');
      console.log('2. Try restarting your Supabase project from the dashboard');
      console.log('3. Check Supabase status page: https://status.supabase.com/');
      return;
    }

    console.log('\n❌ Cannot create users without Supabase Auth API');
    console.log('The auth service is currently experiencing issues.');
    console.log('\nNext steps:');
    console.log('1. Check Supabase status: https://status.supabase.com/');
    console.log('2. Restart your project in Supabase dashboard');
    console.log('3. Contact Supabase support if issue persists');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

createUserDirectly();
