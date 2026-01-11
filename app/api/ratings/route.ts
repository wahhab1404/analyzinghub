import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { analysis_id, analyzer_id, rating, review_text } = await request.json()

    // Handle analyzer rating (rating a user directly)
    if (analyzer_id) {
      if (!rating) {
        return NextResponse.json(
          { error: 'Rating is required' },
          { status: 400 }
        )
      }

      if (rating < 1 || rating > 10) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 10' },
          { status: 400 }
        )
      }

      if (analyzer_id === user.id) {
        return NextResponse.json(
          { error: 'You cannot rate yourself' },
          { status: 400 }
        )
      }

      const { data, error } = await supabase
        .from('analyzer_ratings')
        .upsert({
          analyzer_id,
          user_id: user.id,
          rating,
          review_text: review_text || null,
        }, {
          onConflict: 'analyzer_id,user_id'
        })
        .select()
        .single()

      if (error) {
        console.error('Error submitting analyzer rating:', error)
        return NextResponse.json(
          { error: 'Failed to submit rating' },
          { status: 500 }
        )
      }

      return NextResponse.json({ data })
    }

    // Handle analysis rating (rating an individual analysis)
    if (analysis_id) {
      if (!rating) {
        return NextResponse.json(
          { error: 'Rating is required' },
          { status: 400 }
        )
      }

      if (rating < 1 || rating > 10) {
        return NextResponse.json(
          { error: 'Rating must be between 1 and 10' },
          { status: 400 }
        )
      }

      // Check if analysis exists and user isn't rating their own analysis
      const { data: analysis } = await supabase
        .from('analyses')
        .select('analyzer_id')
        .eq('id', analysis_id)
        .single()

      if (!analysis) {
        return NextResponse.json(
          { error: 'Analysis not found' },
          { status: 404 }
        )
      }

      if (analysis.analyzer_id === user.id) {
        return NextResponse.json(
          { error: 'You cannot rate your own analysis' },
          { status: 400 }
        )
      }

      const { data, error } = await supabase
        .from('analysis_ratings')
        .upsert({
          analysis_id,
          user_id: user.id,
          rating,
          review_text: review_text || null,
        }, {
          onConflict: 'analysis_id,user_id'
        })
        .select()
        .single()

      if (error) {
        console.error('Error submitting rating:', error)
        return NextResponse.json(
          { error: 'Failed to submit rating' },
          { status: 500 }
        )
      }

      return NextResponse.json({ data })
    }

    return NextResponse.json(
      { error: 'Either analysis_id or analyzer_id is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Submit rating error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
