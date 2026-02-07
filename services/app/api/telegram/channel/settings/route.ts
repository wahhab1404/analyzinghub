import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.error('Channel settings: No authenticated user');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Channel settings: Profile fetch error:', profileError);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    const roleName = (profile?.role as any)?.name;
    console.log('Channel settings: User role:', roleName);

    if (!roleName || roleName.toLowerCase() !== 'analyzer') {
      return NextResponse.json(
        { ok: false, error: `Only analyzers can manage channels. Your role: ${roleName || 'none'}` },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { channelId, notifyNewAnalysis, notifyTargetHit, notifyStopHit, enabled, broadcastLanguage } = body;

    if (!channelId) {
      return NextResponse.json(
        { ok: false, error: 'Channel ID is required' },
        { status: 400 }
      );
    }

    console.log('Update settings request:', { channelId, notifyNewAnalysis, notifyTargetHit, notifyStopHit, enabled, broadcastLanguage });

    const updateData: any = {};
    if (typeof notifyNewAnalysis === 'boolean') updateData.notify_new_analysis = notifyNewAnalysis;
    if (typeof notifyTargetHit === 'boolean') updateData.notify_target_hit = notifyTargetHit;
    if (typeof notifyStopHit === 'boolean') updateData.notify_stop_hit = notifyStopHit;
    if (typeof enabled === 'boolean') updateData.enabled = enabled;
    if (broadcastLanguage && ['en', 'ar', 'both'].includes(broadcastLanguage)) {
      updateData.broadcast_language = broadcastLanguage;
    }

    console.log('Update data:', updateData);

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No settings to update' },
        { status: 400 }
      );
    }

    const { data: channel, error: channelError } = await supabase
      .from('telegram_channels')
      .select('id, channel_id, channel_name, audience_type')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (channelError) {
      console.error('Channel settings: Channel fetch error:', channelError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch channel: ${channelError.message}` },
        { status: 500 }
      );
    }

    if (!channel) {
      console.error('Channel settings: No channel found for user:', user.id);
      return NextResponse.json(
        { ok: false, error: 'No channel connected. Please connect a channel first.' },
        { status: 404 }
      );
    }

    console.log('Channel settings: Found channel:', channel.channel_id, 'Updating with:', updateData);

    // Use service role client to bypass RLS for this verified operation
    let serviceClient;
    try {
      serviceClient = createServiceRoleClient();
      console.log('Service role client created successfully');
    } catch (serviceError: any) {
      console.error('Failed to create service role client:', serviceError);
      return NextResponse.json(
        { ok: false, error: `Service client error: ${serviceError.message}` },
        { status: 500 }
      );
    }

    const { data: updatedChannel, error: updateError } = await serviceClient
      .from('telegram_channels')
      .update(updateData)
      .eq('id', channel.id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('Channel settings: Update error:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      });
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to update settings: ${updateError.message}`,
          details: updateError.details,
          hint: updateError.hint
        },
        { status: 500 }
      );
    }

    if (!updatedChannel) {
      console.error('Channel settings: Update returned no data');
      return NextResponse.json(
        { ok: false, error: 'Failed to update channel settings' },
        { status: 500 }
      );
    }

    console.log('Successfully updated channel:', updatedChannel);

    return NextResponse.json({ ok: true, channel: updatedChannel });
  } catch (error) {
    console.error('Error in channel settings route:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
