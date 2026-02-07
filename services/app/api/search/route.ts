import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)
    const { searchParams } = new URL(request.url)

    const query = searchParams.get('q') || ''
    const analyzer = searchParams.get('analyzer') || ''
    const symbol = searchParams.get('symbol') || ''
    const status = searchParams.get('status') || ''

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let queryBuilder = supabase
      .from('analyses')
      .select(`
        *,
        profiles:analyzer_id (id, full_name, avatar_url),
        symbols!inner (symbol),
        analysis_targets (price, expected_time),
        validation_events (event_type, target_number, price_at_hit, hit_at)
      `)

    if (symbol) {
      queryBuilder = queryBuilder.ilike('symbols.symbol', `%${symbol}%`)
    }

    if (status && status !== 'all') {
      queryBuilder = queryBuilder.eq('status', status)
    }

    if (analyzer) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', `%${analyzer}%`)

      if (profiles && profiles.length > 0) {
        const profileIds = profiles.map(p => p.id)
        queryBuilder = queryBuilder.in('analyzer_id', profileIds)
      } else {
        return NextResponse.json({ analyses: [] })
      }
    }

    const { data: analyses, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds = new Set(following?.map(f => f.following_id) || [])

    const analysesWithFollowStatus = analyses?.map(analysis => ({
      ...analysis,
      is_following: followingIds.has(analysis.analyzer_id),
      is_own_post: analysis.analyzer_id === user.id
    })) || []

    return NextResponse.json({ analyses: analysesWithFollowStatus })
  } catch (error: any) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search' },
      { status: 500 }
    )
  }
}
