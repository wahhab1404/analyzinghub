import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user already has an active Telegram account
    const { data: existingAccount } = await supabase
      .from('telegram_accounts')
      .select('id')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();

    if (existingAccount) {
      return NextResponse.json(
        { ok: false, error: 'Telegram account already linked' },
        { status: 400 }
      );
    }

    // Check for existing unused code
    const { data: existingCode } = await supabase
      .from('telegram_link_codes')
      .select('code, expires_at')
      .eq('user_id', user.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json({
        ok: true,
        code: existingCode.code,
        expiresAt: existingCode.expires_at,
      });
    }

    // Generate new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const { error: insertError } = await supabase
      .from('telegram_link_codes')
      .insert({
        user_id: user.id,
        code,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Error creating link code:', insertError);
      return NextResponse.json(
        { ok: false, error: 'Failed to create link code' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error in link-code route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
