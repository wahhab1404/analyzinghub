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

    // Get user's reposts
    const { data: reposts, error } = await supabase
      .from('reposts')
      .select(`
        id,
        created_at,
        comment,
        analysis_id,
        analyses!analysis_id (
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
        )
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get user reposts error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if user is following any of the analyzers
    const analyzerIds = reposts ? Array.from(new Set(reposts.map((r: any) => r.analyses?.analyzer_id).filter(Boolean))) : []
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', analyzerIds)

    const followedAnalyzerIds = new Set(followData?.map(f => f.following_id) || [])

    const transformedReposts = reposts?.map((repost: any) => ({
      ...repost,
      analysis: repost.analyses ? {
        ...repost.analyses,
        profiles: {
          ...repost.analyses.profiles,
          username: repost.analyses.profiles?.email,
          display_name: repost.analyses.profiles?.full_name,
        },
        is_following: followedAnalyzerIds.has(repost.analyses.analyzer_id),
        is_own_post: repost.analyses.analyzer_id === user.id
      } : null
    })) || []

    return NextResponse.json({ reposts: transformedReposts })
  } catch (error: any) {
    console.error('Get user reposts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get user reposts' },
      { status: 500 }
    )
  }
}
