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

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Ratings are on analyses, not analyzers directly
    // Get all ratings this user has given to this analyzer's analyses
    const { data, error } = await supabase
      .from('analysis_ratings')
      .select(`
        id,
        rating,
        review_text,
        created_at,
        analyses!inner (
          analyzer_id
        )
      `)
      .eq('analyses.analyzer_id', analyzerId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching user ratings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ratings' },
        { status: 500 }
      )
    }

    // Return the ratings array (user may have rated multiple analyses)
    return NextResponse.json({ ratings: data || [] })
  } catch (error) {
    console.error('Get user ratings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ analyzerId: string }> }
) {
  try {
    const params = await context.params
    const { analyzerId } = params
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete all ratings this user has given to this analyzer's analyses
    const { data: analysesToDelete } = await supabase
      .from('analyses')
      .select('id')
      .eq('analyzer_id', analyzerId)

    if (analysesToDelete && analysesToDelete.length > 0) {
      const analysisIds = analysesToDelete.map(a => a.id)

      const { error } = await supabase
        .from('analysis_ratings')
        .delete()
        .in('analysis_id', analysisIds)
        .eq('user_id', user.id)

      if (error) {
        console.error('Error deleting ratings:', error)
        return NextResponse.json(
          { error: 'Failed to delete ratings' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete ratings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
