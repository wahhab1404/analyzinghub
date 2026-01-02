import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, roles(*)')
      .eq('id', id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: analyses } = await supabase
      .from('analyses')
      .select(`
        *,
        profiles:analyzer_id (id, full_name, avatar_url),
        symbols (symbol),
        analysis_targets (price, expected_time),
        validation_events (event_type, target_number, price_at_hit, hit_at)
      `)
      .eq('analyzer_id', id)
      .order('created_at', { ascending: false })

    const { data: followData } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', id)
      .maybeSingle()

    const isFollowing = !!followData
    const isOwnProfile = user.id === id

    const { data: stats } = await supabase
      .rpc('get_analyzer_stats', { analyzer_user_id: id })
      .maybeSingle()

    const analysesWithFollowStatus = analyses?.map(analysis => ({
      ...analysis,
      is_following: isFollowing,
      is_own_post: isOwnProfile
    })) || []

    return NextResponse.json({
      profile,
      analyses: analysesWithFollowStatus,
      stats: stats || {
        total_analyses: 0,
        active_analyses: 0,
        completed_analyses: 0,
        successful_analyses: 0,
        success_rate: 0,
        followers_count: 0,
        following_count: 0
      },
      isFollowing,
      isOwnProfile,
    })
  } catch (err: any) {
    console.error('GET_PROFILE_ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
