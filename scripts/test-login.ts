import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
  try {
    const email = 'alnasserfahad333@gmail.com';
    const password = 'Ff0551187442';

    console.log('\n🔐 Testing login...');
    console.log('Email:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('\n❌ Login failed:');
      console.error('Error:', error.message);
      console.error('Status:', error.status);
      console.error('Details:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log('\n✅ Login successful!');
    console.log('User ID:', data.user?.id);
    console.log('Email:', data.user?.email);
    console.log('Session expires:', new Date(data.session?.expires_at || 0).toISOString());

    // Test fetching profile
    console.log('\n📋 Fetching profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        role:roles(*)
      `)
      .eq('id', data.user?.id)
      .single();

    if (profileError) {
      console.error('\n❌ Failed to fetch profile:');
      console.error('Error:', profileError.message);
      console.error('Details:', JSON.stringify(profileError, null, 2));
      process.exit(1);
    }

    console.log('✅ Profile fetched successfully');
    console.log('Name:', profile.full_name);
    console.log('Role:', profile.role?.name);

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

testLogin();
