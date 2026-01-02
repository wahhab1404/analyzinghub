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

async function resetPassword() {
  try {
    const email = 'alnasserfahad333@gmail.com';
    const newPassword = 'Ff0551187442';

    console.log('\n🔐 Resetting password for:', email);

    // Update user with admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      '3d9ff3f6-8f31-49ce-b126-e63259ebb667',
      { password: newPassword }
    );

    if (error) {
      console.error('\n❌ Failed to reset password:');
      console.error('Error:', error.message);
      console.error('Details:', JSON.stringify(error, null, 2));
      process.exit(1);
    }

    console.log('\n✅ Password reset successfully!');
    console.log('User ID:', data.user.id);
    console.log('Email:', data.user.email);
    console.log('\nNew credentials:');
    console.log('Email:', email);
    console.log('Password:', newPassword);

  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

resetPassword();
