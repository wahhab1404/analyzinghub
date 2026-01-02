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

async function deleteAndRecreateUser() {
  try {
    const email = 'alnasserfahad333@gmail.com';
    const password = 'Ff0551187442';
    const fullName = 'Fahad Bin Saidan';

    console.log('\n🗑️  Deleting existing user...');

    // Delete from auth.users (this will cascade to profiles)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      '3d9ff3f6-8f31-49ce-b126-e63259ebb667'
    );

    if (deleteError) {
      console.log('Delete error (might not exist):', deleteError.message);
    } else {
      console.log('✅ User deleted');
    }

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n📝 Creating new user...');

    // Get the Analyzer role ID
    const roleId = '927c9931-7bb6-4848-842f-8243425ec6d5';

    // Create user
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'Analyzer',
      },
    });

    if (createError) {
      console.error('\n❌ Failed to create user:');
      console.error('Error:', createError.message);
      console.error('Details:', JSON.stringify(createError, null, 2));
      process.exit(1);
    }

    console.log('✅ User created');
    console.log('User ID:', authData.user?.id);

    // Wait for trigger
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check profile
    console.log('\n📋 Checking profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role:roles(name)')
      .eq('id', authData.user?.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile check error:', profileError);
    } else if (profile) {
      console.log('✅ Profile found');
      console.log('Name:', profile.full_name);
      console.log('Role:', (profile.role as any)?.name);
    } else {
      console.log('⚠️  No profile found, creating manually...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user?.id,
          email,
          full_name: fullName,
          role_id: roleId,
          is_active: true,
        });

      if (insertError) {
        console.error('Failed to create profile:', insertError);
      } else {
        console.log('✅ Profile created manually');
      }
    }

    console.log('\n✅ User recreated successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Test login
    console.log('\n🔐 Testing login...');
    const testClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: loginData, error: loginError } = await testClient.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      console.error('\n❌ Login test failed:');
      console.error('Error:', loginError.message);
      console.error('Status:', loginError.status);
    } else {
      console.log('✅ Login test successful!');
      console.log('User ID:', loginData.user?.id);
    }

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

deleteAndRecreateUser();
