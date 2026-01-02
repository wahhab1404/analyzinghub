import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const { email, code, username } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[OTP Verify] Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const cookieStore: Array<{ name: string; value: string; options?: any }> = [];

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.push({ name, value, options });
          },
          remove(name, options) {
            cookieStore.push({ name, value: '', options });
          },
        },
      }
    );

    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP code' },
        { status: 400 }
      );
    }

    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Maximum verification attempts exceeded. Please request a new code.' },
        { status: 400 }
      );
    }

    if (new Date(otpRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'OTP code has expired. Please request a new code.' },
        { status: 400 }
      );
    }

    if (otpRecord.code !== code) {
      await supabase
        .from('otp_codes')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('id', otpRecord.id);

      const remainingAttempts = MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return NextResponse.json(
        {
          error: `Invalid code. ${remainingAttempts} attempts remaining.`,
          remainingAttempts
        },
        { status: 400 }
      );
    }

    await supabase
      .from('otp_codes')
      .update({ verified: true })
      .eq('id', otpRecord.id);

    let userId = otpRecord.user_id;
    let isNewUser = false;

    if (!userId) {
      if (!username) {
        return NextResponse.json(
          { error: 'Username is required for new users' },
          { status: 400 }
        );
      }

      const { data: existingUsername } = await supabase
        .from('profiles')
        .select('id')
        .eq('full_name', username)
        .maybeSingle();

      if (existingUsername) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 400 }
        );
      }

      const generatedPassword = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now()}`;

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: generatedPassword,
        options: {
          data: {
            username,
          },
          emailRedirectTo: undefined,
        },
      });

      if (signUpError || !authData.user) {
        console.error('Error creating user:', signUpError);
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        );
      }

      userId = authData.user.id;
      isNewUser = true;

      await supabase
        .from('otp_codes')
        .update({ password_hash: generatedPassword })
        .eq('id', otpRecord.id);

      const { data: traderRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'Trader')
        .single();

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email,
          full_name: username,
          role_id: traderRole?.id || '00000000-0000-0000-0000-000000000002',
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }

    if (isNewUser) {
      const { data: otpPassword } = await supabase
        .from('otp_codes')
        .select('password_hash')
        .eq('id', otpRecord.id)
        .single();

      if (otpPassword?.password_hash) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: otpPassword.password_hash,
        });

        if (signInError) {
          console.error('Error signing in new user:', signInError);
          return NextResponse.json(
            { error: 'Failed to create session for new user' },
            { status: 500 }
          );
        }
      }
    } else {
      const generatedPassword = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now()}`;

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        { password: generatedPassword }
      );

      if (updateError) {
        console.error('Error updating user password:', updateError);
        return NextResponse.json(
          { error: 'Failed to update user credentials' },
          { status: 500 }
        );
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: generatedPassword,
      });

      if (signInError) {
        console.error('Error signing in existing user:', signInError);
        return NextResponse.json(
          { error: 'Failed to create session for existing user' },
          { status: 500 }
        );
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', userId)
      .single();

    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      isNewUser,
      user: profile,
    });

    cookieStore.forEach(({ name, value, options }) => {
      response.cookies.set({ name, value, ...options });
    });

    return response;
  } catch (error) {
    console.error('Error in OTP verification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
