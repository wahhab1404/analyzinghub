import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params = await context.params
    const { symbol: symbolParam } = params
    const supabase = createRouteHandlerClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    const symbol = symbolParam.toUpperCase()

    const baseQuery = supabase
      .from('analyses')
      .select(`
        id,
        direction,
        stop_loss,
        chart_image_url,
        created_at,
        status,
        validated_at,
        analyzer_id,
        profiles!analyses_analyzer_id_fkey (
          id,
          full_name,
          avatar_url
        ),
        symbols!inner (
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
      .eq('symbols.symbol', symbol)
      .order('created_at', { ascending: false })

    const { data: analyses, error } = await baseQuery

    if (error) {
      console.error('Error fetching analyses:', error)
      return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 })
    }

    let following: string[] = []
    if (user) {
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      following = followData?.map(f => f.following_id) || []
    }

    const formattedAnalyses = analyses?.map(analysis => ({
      ...analysis,
      is_following: user ? following.includes(analysis.analyzer_id) : false,
      is_own_post: user ? analysis.analyzer_id === user.id : false,
    })) || []

    const latest = formattedAnalyses.slice(0, 10)

    const analysesWithRatings = await Promise.all(
      formattedAnalyses.map(async (analysis) => {
        const { data: ratings } = await supabase
          .from('analysis_ratings')
          .select('rating')
          .eq('analysis_id', analysis.id)

        const totalRatings = ratings?.length || 0
        const averageRating = totalRatings > 0 && ratings
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
          : 0

        return {
          ...analysis,
          averageRating,
          totalRatings,
        }
      })
    )

    const top = analysesWithRatings
      .filter(a => a.totalRatings > 0)
      .sort((a, b) => {
        if (b.averageRating !== a.averageRating) {
          return b.averageRating - a.averageRating
        }
        return b.totalRatings - a.totalRatings
      })
      .slice(0, 10)

    return NextResponse.json({
      latest,
      top,
    })
  } catch (error) {
    console.error('Error in GET /api/symbols/[symbol]/analyses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
