import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

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
        { ok: false, error: 'Only analyzers can disconnect channels' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { audienceType } = body;

    if (!audienceType || !['public', 'followers', 'subscribers'].includes(audienceType)) {
      return NextResponse.json(
        { ok: false, error: 'Valid audience type is required' },
        { status: 400 }
      );
    }

    const { data: channel } = await supabase
      .from('telegram_channels')
      .select('channel_id, audience_type')
      .eq('user_id', user.id)
      .eq('audience_type', audienceType)
      .eq('enabled', true)
      .maybeSingle();

    if (!channel) {
      return NextResponse.json(
        { ok: false, error: `No active ${audienceType} channel found` },
        { status: 404 }
      );
    }

    // Use service role client to bypass RLS for this verified operation
    const serviceClient = createServiceRoleClient();
    const { error: updateError } = await serviceClient
      .from('telegram_channels')
      .update({ enabled: false })
      .eq('user_id', user.id)
      .eq('channel_id', channel.channel_id)
      .eq('audience_type', audienceType);

    if (updateError) {
      console.error('Error disconnecting channel:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Failed to disconnect channel' },
        { status: 500 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: channel.channel_id,
            text: '👋 AnalyzingHub bot has been disconnected.\n\nNo more analysis notifications will be posted here.\n\n👋 تم فصل بوت AnalyzingHub.\n\nلن يتم نشر إشعارات التحليل هنا بعد الآن.',
          }),
        });
      } catch (error) {
        console.error('Error sending disconnect message:', error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in channel disconnect route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
