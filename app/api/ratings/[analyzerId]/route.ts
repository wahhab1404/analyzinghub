import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ analyzerId: string }> }
) {
  try {
    const params = await context.params
    const { analyzerId } = params
    const supabase = createRouteHandlerClient(request)

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const [ratingsResult, statsResult] = await Promise.all([
      supabase
        .from('analysis_ratings')
        .select(`
          id,
          rating,
          review_text,
          created_at,
          updated_at,
          analyses!inner (
            analyzer_id
          ),
          profiles!analysis_ratings_user_id_fkey (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('analyses.analyzer_id', analyzerId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),

      supabase
        .from('analyzer_rating_stats')
        .select('*')
        .eq('analyzer_id', analyzerId)
        .maybeSingle()
    ])

    if (ratingsResult.error) {
      console.error('Error fetching ratings:', ratingsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch ratings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ratings: ratingsResult.data || [],
      stats: statsResult.data || {
        average_rating: 0,
        total_ratings: 0,
        rating_distribution: {}
      }
    })
  } catch (error) {
    console.error('Get ratings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
