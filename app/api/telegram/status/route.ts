import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: account } = await supabase
      .from('telegram_accounts')
      .select('username, linked_at')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({
        ok: true,
        connected: false,
      });
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      username: account.username,
      linkedAt: account.linked_at,
    });
  } catch (error) {
    console.error('Error in status route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
