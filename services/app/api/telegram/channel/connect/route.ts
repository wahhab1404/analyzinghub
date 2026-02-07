import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';
import { createServiceRoleClient } from '@/lib/supabase/server';

async function getBotToken(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'telegram_bot_token')
    .maybeSingle();

  if (data?.setting_value && data.setting_value !== 'YOUR_BOT_TOKEN_HERE') {
    return data.setting_value;
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  if (envToken && envToken !== 'YOUR_BOT_TOKEN_HERE') {
    return envToken;
  }

  return null;
}

async function verifyChannelAccess(channelId: string, botToken: string): Promise<{ ok: boolean; channelName?: string; error?: string }> {

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: channelId,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      if (data.description?.includes('chat not found')) {
        return { ok: false, error: 'Channel not found. Make sure the bot is added as an admin.' };
      }
      return { ok: false, error: data.description || 'Failed to access channel' };
    }

    const chat = data.result;
    if (chat.type !== 'channel') {
      return { ok: false, error: 'This is not a channel. Please provide a channel ID.' };
    }

    const channelName = chat.title || chat.username || 'Unknown Channel';

    const testResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: channelId,
        text: '✅ AnalyzingHub bot connected successfully!\n\nYour analysis notifications will be posted here.\n\n✅ تم ربط بوت AnalyzingHub بنجاح!\n\nسيتم نشر إشعارات التحليل هنا.',
      }),
    });

    const testData = await testResponse.json();

    if (!testData.ok) {
      return { ok: false, error: 'Bot cannot post to channel. Ensure bot is added as admin with post permission.' };
    }

    return { ok: true, channelName };
  } catch (error) {
    console.error('Error verifying channel:', error);
    return { ok: false, error: 'Failed to verify channel access' };
  }
}

export async function POST(request: NextRequest) {
  console.log('=== Channel Connect API called ===');
  try {
    const supabase = createRouteHandlerClient(request);
    console.log('Supabase client created');

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log('Auth check:', { hasUser: !!user, authError: authError?.message });

    if (authError || !user) {
      console.error('Auth error in channel connect:', authError);
      return NextResponse.json({ ok: false, error: 'Not authenticated. Please log in.' }, { status: 401 });
    }

    console.log('User authenticated:', user.id);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .maybeSingle();

    console.log('Profile fetch:', { profile, error: profileError });

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.json(
        { ok: false, error: 'Failed to verify user role' },
        { status: 500 }
      );
    }

    const roleName = (profile?.role as any)?.name;
    console.log('Role check:', { roleName, isAnalyzer: roleName?.toLowerCase() === 'analyzer' });

    if (!roleName || roleName.toLowerCase() !== 'analyzer') {
      console.error('Role check failed. User role:', roleName);
      return NextResponse.json(
        { ok: false, error: 'Only analyzers can connect channels. Your role: ' + (roleName || 'none') },
        { status: 403 }
      );
    }

    const body = await request.json();
    console.log('Request body:', body);
    let { channelId, channelUsername, audienceType, isPlatformDefault, linkedPlanId } = body;

    if (!channelId && !channelUsername) {
      return NextResponse.json(
        { ok: false, error: 'Channel ID or username is required' },
        { status: 400 }
      );
    }

    if (!audienceType || !['public', 'followers', 'subscribers'].includes(audienceType)) {
      return NextResponse.json(
        { ok: false, error: 'Valid audience type is required (public, followers, or subscribers)' },
        { status: 400 }
      );
    }

    if (channelUsername && !channelId) {
      channelId = `@${channelUsername.replace('@', '')}`;
    }

    // If marking as platform default, check if user already has a platform default for this audience type
    if (isPlatformDefault) {
      const { data: existingDefault } = await supabase
        .from('telegram_channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('audience_type', audienceType)
        .eq('is_platform_default', true)
        .eq('enabled', true)
        .maybeSingle();

      if (existingDefault) {
        return NextResponse.json(
          { ok: false, error: `You already have a platform default ${audienceType} channel. Only one platform default per type is allowed.` },
          { status: 400 }
        );
      }
    }

    // For non-platform channels, user can have multiple (for different plans)

    const botToken = await getBotToken(supabase);

    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: 'Bot token not configured. Please set TELEGRAM_BOT_TOKEN in admin settings.' },
        { status: 400 }
      );
    }

    const verification = await verifyChannelAccess(channelId, botToken);

    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: 400 }
      );
    }

    // Use service role client to check for existing channels and bypass RLS
    const serviceClient = createServiceRoleClient();

    // Check if this channel+audience_type is already connected to anyone
    const { data: existingChannel } = await serviceClient
      .from('telegram_channels')
      .select('id, user_id, enabled, audience_type')
      .eq('channel_id', channelId)
      .eq('audience_type', audienceType)
      .maybeSingle();

    if (existingChannel) {
      // If it's the same user's old channel, delete it and recreate
      if (existingChannel.user_id === user.id) {
        const { error: deleteError } = await serviceClient
          .from('telegram_channels')
          .delete()
          .eq('id', existingChannel.id);

        if (deleteError) {
          console.error('Error removing old channel:', deleteError);
          return NextResponse.json(
            { ok: false, error: 'Failed to reconnect channel' },
            { status: 500 }
          );
        }
        // Continue to insert new record below
      } else {
        // Channel is connected to another user for this audience type
        return NextResponse.json(
          { ok: false, error: `This channel is already connected to another account for ${audienceType} content.` },
          { status: 400 }
        );
      }
    }

    // Insert new channel connection
    const { error: insertError } = await serviceClient
      .from('telegram_channels')
      .insert({
        user_id: user.id,
        channel_id: channelId,
        channel_name: verification.channelName!,
        audience_type: audienceType,
        enabled: true,
        verified_at: new Date().toISOString(),
        is_platform_default: isPlatformDefault || false,
        linked_plan_id: linkedPlanId || null,
      });

    if (insertError) {
      console.error('Error inserting channel:', insertError);
      return NextResponse.json(
        { ok: false, error: `Failed to save channel: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      channel: {
        channelId,
        channelName: verification.channelName,
      },
    });
  } catch (error) {
    console.error('=== ERROR in channel connect route ===');
    console.error('Error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
