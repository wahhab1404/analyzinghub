import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoringService } from '@/services/scoring/scoring.service'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { analysisId, rating } = body

    if (!analysisId) {
      return NextResponse.json({ error: 'Analysis ID is required' }, { status: 400 })
    }

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 })
    }

    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, analyzer_id, status')
      .eq('id', analysisId)
      .single()

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    if (analysis.analyzer_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot rate your own analysis' },
        { status: 400 }
      )
    }

    if (!['SUCCESS', 'FAILED'].includes(analysis.status)) {
      return NextResponse.json(
        { error: 'Can only rate closed analyses' },
        { status: 400 }
      )
    }

    const { data: existingRating } = await supabase
      .from('analysis_ratings')
      .select('id')
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingRating) {
      return NextResponse.json(
        { error: 'You have already rated this analysis' },
        { status: 400 }
      )
    }

    const { data: newRating, error: ratingError } = await supabase
      .from('analysis_ratings')
      .insert({
        analysis_id: analysisId,
        user_id: user.id,
        rating,
      })
      .select()
      .single()

    if (ratingError) {
      console.error('Rating creation error:', ratingError)
      return NextResponse.json({ error: 'Failed to submit rating' }, { status: 500 })
    }

    const scoringResult = await scoringService.awardRatingPoints(user.id, analysisId)

    if (!scoringResult.ok) {
      console.warn('Scoring failed for rating:', scoringResult.error)
    }

    return NextResponse.json({
      ok: true,
      rating: newRating,
      pointsAwarded: scoringResult.ok,
    })
  } catch (error) {
    console.error('Rating submission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
