import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's own posts (analyses)
    const { data: analyses, error } = await supabase
      .from('analyses')
      .select(`
        *,
        profiles!analyses_analyzer_id_fkey (
          id,
          full_name,
          avatar_url,
          email
        ),
        symbols (
          id,
          symbol
        ),
        analysis_targets (
          id,
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
      .eq('analyzer_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get user posts error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if user is following any of the analyzers
    const analyzerIds = Array.from(new Set(analyses?.map(a => a.analyzer_id) || []))
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', analyzerIds)

    const followedAnalyzerIds = new Set(followData?.map(f => f.following_id) || [])

    // Get subscription status
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('analyst_id')
      .eq('subscriber_id', user.id)
      .eq('status', 'active')

    const subscribedToIds = new Set(subscriptions?.map(s => s.analyst_id) || [])

    // Filter based on visibility
    const filteredAnalyses = analyses?.filter(analysis => {
      const isOwnPost = analysis.analyzer_id === user.id
      const isFollowing = followedAnalyzerIds.has(analysis.analyzer_id)
      const isSubscribed = subscribedToIds.has(analysis.analyzer_id)

      // Author always sees their own posts
      if (isOwnPost) return true

      // Check visibility
      if (!analysis.visibility || analysis.visibility === 'public') return true
      if (analysis.visibility === 'followers' && isFollowing) return true
      if (analysis.visibility === 'subscribers' && isSubscribed) return true
      if (analysis.visibility === 'private') return false

      return false
    }) || []

    const transformedAnalyses = filteredAnalyses.map(analysis => ({
      ...analysis,
      profiles: {
        ...analysis.profiles,
        username: analysis.profiles.email,
        display_name: analysis.profiles.full_name,
      },
      is_following: followedAnalyzerIds.has(analysis.analyzer_id),
      is_own_post: analysis.analyzer_id === user.id,
      is_subscribed: subscribedToIds.has(analysis.analyzer_id)
    }))

    return NextResponse.json({ analyses: transformedAnalyses })
  } catch (error: any) {
    console.error('Get user posts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get user posts' },
      { status: 500 }
    )
  }
}
