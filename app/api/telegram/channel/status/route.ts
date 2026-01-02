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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .maybeSingle();

    const roleName = (profile?.role as any)?.name;
    if (roleName?.toLowerCase() !== 'analyzer') {
      return NextResponse.json(
        { ok: false, error: 'Only analyzers can connect channels' },
        { status: 403 }
      );
    }

    const { data: channel } = await supabase
      .from('telegram_channels')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .maybeSingle();

    if (!channel) {
      return NextResponse.json({
        ok: true,
        connected: false,
      });
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      channel: {
        channelId: channel.channel_id,
        channelName: channel.channel_name,
        verified: !!channel.verified_at,
        notifyNewAnalysis: channel.notify_new_analysis,
        notifyTargetHit: channel.notify_target_hit,
        notifyStopHit: channel.notify_stop_hit,
        broadcastLanguage: channel.broadcast_language || 'en',
        createdAt: channel.created_at,
      },
    });
  } catch (error) {
    console.error('Error in channel status route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
