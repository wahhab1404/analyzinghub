import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables:');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAnalyzerUser() {
  try {
    const email = 'alnasserfahad333@gmail.com';
    const password = 'Ff0551187442';
    const fullName = 'Fahad Bin Saidan';
    const role = 'Analyzer';

    console.log('\n🚀 Creating analyzer user...');
    console.log('Email:', email);
    console.log('Name:', fullName);
    console.log('Role:', role);

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      console.log('\n⚠️  User already exists with this email');
      console.log('User ID:', existingUser.id);
      console.log('\nYou can:');
      console.log('1. Use a different email');
      console.log('2. Delete the existing user first');
      console.log('3. Reset the password for this user');
      process.exit(0);
    }

    // Hardcoded role ID to bypass PostgREST cache issues with new Supabase instances
    // This is the Analyzer role ID from the database
    const roleData = {
      id: '927c9931-7bb6-4848-842f-8243425ec6d5',
      name: 'Analyzer'
    };

    console.log('Using Analyzer role ID:', roleData.id);

    console.log('\n📝 Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

    if (authError) {
      console.error('\n❌ Failed to create auth user:');
      console.error('Error:', authError.message);
      console.error('Details:', JSON.stringify(authError, null, 2));
      process.exit(1);
    }

    if (!authData.user) {
      console.error('\n❌ No user data returned from auth.admin.createUser');
      process.exit(1);
    }

    console.log('✅ Auth user created');
    console.log('User ID:', authData.user.id);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('\n📝 Checking profile creation...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role:roles(name)')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('\n❌ Error fetching profile:');
      console.error(profileError);
    } else if (!profile) {
      console.log('\n⚠️  Profile not created by trigger, creating manually...');

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email,
          full_name: fullName,
          role_id: roleData.id,
          is_active: true,
        });

      if (insertError) {
        console.error('\n❌ Failed to create profile:');
        console.error(insertError);
        process.exit(1);
      }

      console.log('✅ Profile created manually');
    } else {
      console.log('✅ Profile created by trigger');
      console.log('Profile:', JSON.stringify(profile, null, 2));
    }

    console.log('\n✅ Analyzer user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role:', role);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n🔐 Please change the password after first login!');

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

createAnalyzerUser();
