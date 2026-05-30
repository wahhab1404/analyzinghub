/**
 * GET /api/spx/telegram-channels
 *
 * Returns the list of enabled Telegram channels visible to the
 * Analyzer/SuperAdmin caller so the SPX Settings panel can render a
 * checkbox selector for the "auto-trade destination channels".
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();
    const roleName = (profile as any)?.roles?.name;
    if (!['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data: channels, error } = await supabase
      .from('telegram_channels')
      .select('id, channel_id, channel_name, audience_type, enabled')
      .eq('enabled', true)
      .order('channel_name', { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      channels: (channels ?? []).map((c: any) => ({
        id: c.id,
        chatId: c.channel_id,
        name: c.channel_name ?? c.channel_id,
        audience: c.audience_type ?? 'public',
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
