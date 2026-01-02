import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params

    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Fetching analysis with ID:', id)

    const { data: analysis, error } = await supabase
      .from('analyses')
      .select(`
        *,
        profiles!analyses_analyzer_id_fkey (
          id,
          full_name,
          avatar_url,
          bio,
          role:roles(name)
        ),
        symbols (
          symbol
        ),
        analysis_targets (
          price,
          expected_time
        ),
        validation_events (
          event_type,
          target_number,
          price_at_hit,
          hit_at
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('Supabase error fetching analysis:', error)
      return NextResponse.json({
        error: 'Failed to fetch analysis',
        details: error.message
      }, { status: 500 })
    }

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    const { data: followData } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', analysis.profiles?.id)
      .maybeSingle()

    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('subscriber_id', user.id)
      .eq('analyst_id', analysis.profiles?.id)
      .eq('status', 'active')
      .maybeSingle()

    const isFollowing = !!followData
    const isSubscribed = !!subscriptions
    const isOwnPost = analysis.profiles?.id === user.id

    // Check visibility permissions
    if (!isOwnPost) {
      if (analysis.visibility === 'private') {
        return NextResponse.json({ error: 'This analysis is private' }, { status: 403 })
      }
      if (analysis.visibility === 'subscribers' && !isSubscribed) {
        return NextResponse.json({ error: 'This analysis is for subscribers only' }, { status: 403 })
      }
      if (analysis.visibility === 'followers' && !isFollowing) {
        return NextResponse.json({ error: 'This analysis is for followers only' }, { status: 403 })
      }
    }

    return NextResponse.json({
      analysis: {
        ...analysis,
        is_following: isFollowing,
        is_own_post: isOwnPost,
        is_subscribed: isSubscribed,
      }
    })
  } catch (error) {
    console.error('Error fetching analysis:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
