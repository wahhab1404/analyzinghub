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
    const { data: { user } } = await supabase.auth.getUser()
    const analysisId = id

    const { data: ratings, error: ratingsError } = await supabase
      .from('analysis_ratings')
      .select('rating')
      .eq('analysis_id', analysisId)

    if (ratingsError) {
      console.error('Error fetching ratings:', ratingsError)
      return NextResponse.json({ error: 'Failed to fetch ratings' }, { status: 500 })
    }

    const totalRatings = ratings?.length || 0
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : 0

    let userRating = 0
    if (user) {
      const { data: userRatingData } = await supabase
        .from('analysis_ratings')
        .select('rating')
        .eq('analysis_id', analysisId)
        .eq('user_id', user.id)
        .maybeSingle()

      userRating = userRatingData?.rating || 0
    }

    return NextResponse.json({
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings,
      userRating,
    })
  } catch (error) {
    console.error('Error in GET /api/analyses/[id]/ratings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = createRouteHandlerClient(request)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const analysisId = id
    const body = await request.json()
    const { rating } = body

    if (!rating || rating < 1 || rating > 10) {
      return NextResponse.json({ error: 'Rating must be between 1 and 10' }, { status: 400 })
    }

    const { data: analysis } = await supabase
      .from('analyses')
      .select('analyzer_id')
      .eq('id', analysisId)
      .single()

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    if (analysis.analyzer_id === user.id) {
      return NextResponse.json({ error: 'Cannot rate your own analysis' }, { status: 400 })
    }

    const { error: upsertError } = await supabase
      .from('analysis_ratings')
      .upsert({
        analysis_id: analysisId,
        user_id: user.id,
        rating,
      }, {
        onConflict: 'analysis_id,user_id',
      })

    if (upsertError) {
      console.error('Error upserting rating:', upsertError)
      return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 })
    }

    const { data: ratings } = await supabase
      .from('analysis_ratings')
      .select('rating')
      .eq('analysis_id', analysisId)

    const totalRatings = ratings?.length || 0
    const averageRating = totalRatings > 0 && ratings
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : 0

    return NextResponse.json({
      success: true,
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings,
    })
  } catch (error) {
    console.error('Error in POST /api/analyses/[id]/ratings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
