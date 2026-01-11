import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const analysisId = params.id

    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { channelId } = await request.json()

    if (!channelId) {
      return NextResponse.json(
        { error: 'Channel ID is required' },
        { status: 400 }
      )
    }

    console.log('Resend request:', {
      analysisId,
      channelId,
      userId: user.id
    })

    // Use service role to check analysis ownership (bypass RLS)
    const serviceSupabase = createServiceRoleClient()

    // Verify the analysis belongs to the user
    const { data: analysis, error: analysisError } = await serviceSupabase
      .from('analyses')
      .select('id, analyzer_id, symbols(symbol), direction, stop_loss, activation_price')
      .eq('id', analysisId)
      .eq('analyzer_id', user.id)
      .maybeSingle()

    if (analysisError) {
      console.error('Error fetching analysis:', analysisError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis not found or access denied' },
        { status: 404 }
      )
    }

    // Verify the channel belongs to the user
    const { data: channel, error: channelError } = await serviceSupabase
      .from('telegram_channels')
      .select('id, channel_id, channel_name, enabled')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (channelError) {
      console.error('Error fetching channel:', channelError)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found or access denied' },
        { status: 404 }
      )
    }

    if (!channel.enabled) {
      return NextResponse.json(
        { error: 'Channel is not enabled' },
        { status: 400 }
      )
    }

    // Call the broadcast edge function with the specific channel
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/telegram-channel-broadcast`

    console.log('Resending analysis to channel:', {
      analysisId,
      channelId: channel.channel_id,
      channelName: channel.channel_name
    })

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({
        userId: user.id,
        analysisId: analysisId,
        channelId: channel.channel_id,
        eventType: 'new_analysis',
        symbol: (analysis as any).symbols?.symbol,
        direction: analysis.direction,
        stopLoss: analysis.stop_loss,
        activationPrice: analysis.activation_price,
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.ok) {
      console.error('Failed to resend analysis:', result)
      return NextResponse.json(
        { error: result.error || 'Failed to send to channel' },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Analysis sent to ${channel.channel_name}`,
      channelName: channel.channel_name
    })
  } catch (error: any) {
    console.error('Error in resend-to-channel:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
