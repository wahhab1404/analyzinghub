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

    // Get the user's direct rating of this analyzer
    const { data, error } = await supabase
      .from('analyzer_ratings')
      .select('id, rating, review_text, created_at')
      .eq('analyzer_id', analyzerId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching user rating:', error)
      return NextResponse.json(
        { error: 'Failed to fetch rating' },
        { status: 500 }
      )
    }

    // Return the rating object or null if no rating exists
    return NextResponse.json({ rating: data })
  } catch (error) {
    console.error('Get user rating error:', error)
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

    // Delete the user's direct rating of this analyzer
    const { error } = await supabase
      .from('analyzer_ratings')
      .delete()
      .eq('analyzer_id', analyzerId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting rating:', error)
      return NextResponse.json(
        { error: 'Failed to delete rating' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete rating error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
