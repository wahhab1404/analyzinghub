import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[OTP Request] Missing Supabase environment variables');
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

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    await supabase.rpc('cleanup_expired_otps');

    await supabase
      .from('otp_codes')
      .delete()
      .eq('email', email)
      .eq('verified', false);

    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        email,
        code: otpCode,
        user_id: existingUser?.id || null,
        expires_at: expiresAt.toISOString(),
        verified: false,
        attempts: 0,
      });

    if (insertError) {
      console.error('Error creating OTP:', insertError);
      return NextResponse.json(
        { error: 'Failed to create OTP code' },
        { status: 500 }
      );
    }

    const emailFunctionUrl = `${supabaseUrl}/functions/v1/send-otp-email`;

    const emailResponse = await fetch(emailFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: email,
        code: otpCode,
        subject: `Your AnalyzingHub verification code: ${otpCode}`,
        type: existingUser ? 'login' : 'signup',
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Error sending email:', errorText);
      return NextResponse.json(
        { error: 'Failed to send OTP email' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'OTP code sent to your email',
      isNewUser: !existingUser,
    }, { status: 200 });

    cookieStore.forEach(({ name, value, options }) => {
      response.cookies.set({ name, value, ...options });
    });

    return response;
  } catch (error) {
    console.error('Error in OTP request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
