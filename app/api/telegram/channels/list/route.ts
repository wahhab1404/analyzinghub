import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, roles(*)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.roles?.name !== 'Analyzer') {
      return NextResponse.json({ ok: false, error: 'Only analyzers can access channels' }, { status: 403 })
    }

    const { data: channels, error } = await supabase
      .from('telegram_channels')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .order('audience_type', { ascending: true })

    if (error) {
      console.error('Error fetching channels:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const formattedChannels = channels?.map(ch => ({
      id: ch.id,
      channelId: ch.channel_id,
      channelName: ch.channel_name,
      audienceType: ch.audience_type,
      verified: !!ch.verified_at,
      notifyNewAnalysis: ch.notify_new_analysis,
      notifyTargetHit: ch.notify_target_hit,
      notifyStopHit: ch.notify_stop_hit,
      broadcastLanguage: ch.broadcast_language || 'both',
      createdAt: ch.created_at,
    })) || []

    return NextResponse.json({
      ok: true,
      channels: formattedChannels,
    })
  } catch (err: any) {
    console.error('GET_CHANNELS_ERROR:', err)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}
