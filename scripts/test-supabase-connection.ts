import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🔍 Checking environment variables...');
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing');

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('\n❌ Missing required environment variables');
  process.exit(1);
}

async function testConnection() {
  try {
    console.log('\n🔐 Testing Service Role Key...');
    const serviceClient = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Test 1: Query roles table (should work with service role)
    console.log('\n📋 Test 1: Querying roles table...');
    const { data: roles, error: rolesError } = await serviceClient
      .from('roles')
      .select('*');

    if (rolesError) {
      console.error('❌ Failed to query roles:', rolesError.message);
    } else {
      console.log('✅ Roles query successful');
      console.log('Found', roles?.length, 'roles');
    }

    // Test 2: Query profiles table
    console.log('\n📋 Test 2: Querying profiles table...');
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, email')
      .limit(5);

    if (profilesError) {
      console.error('❌ Failed to query profiles:', profilesError.message);
    } else {
      console.log('✅ Profiles query successful');
      console.log('Found', profiles?.length, 'profiles');
    }

    // Test 3: Check auth admin access
    console.log('\n📋 Test 3: Listing auth users (admin)...');
    const { data: usersData, error: usersError } = await serviceClient.auth.admin.listUsers();

    if (usersError) {
      console.error('❌ Failed to list users:', usersError.message);
      console.error('Status:', usersError.status);
      console.error('This suggests the service role key may be invalid or auth service is down');
    } else {
      console.log('✅ Auth admin access successful');
      console.log('Found', usersData?.users?.length, 'users');
    }

    // Test 4: Try anon key
    console.log('\n📋 Test 4: Testing Anon Key...');
    const anonClient = createClient(supabaseUrl!, supabaseAnonKey!);

    const { data: publicRoles, error: publicRolesError } = await anonClient
      .from('roles')
      .select('*');

    if (publicRolesError) {
      console.error('❌ Anon key test failed:', publicRolesError.message);
    } else {
      console.log('✅ Anon key works');
      console.log('Can query roles:', publicRoles?.length);
    }

    console.log('\n✅ All basic tests completed');

  } catch (error: any) {
    console.error('\n❌ Unexpected error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testConnection();
