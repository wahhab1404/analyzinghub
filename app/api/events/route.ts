import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const body = await request.json()
    const { entity_type, entity_id, event_type, metadata } = body

    if (!entity_type || !entity_id || !event_type) {
      return NextResponse.json(
        { tracked: false, message: 'Missing required fields' },
        { status: 200 }
      )
    }

    const validEntityTypes = ['analysis', 'analyzer', 'symbol']
    const validEventTypes = ['view', 'like', 'bookmark', 'comment', 'follow', 'share', 'unlike', 'unbookmark', 'unfollow']

    if (!validEntityTypes.includes(entity_type)) {
      return NextResponse.json(
        { tracked: false, message: 'Invalid entity_type' },
        { status: 200 }
      )
    }

    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { tracked: false, message: 'Invalid event_type' },
        { status: 200 }
      )
    }

    if (!user) {
      return NextResponse.json({
        tracked: false,
        message: 'Event tracking requires authentication'
      }, { status: 200 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({
        tracked: false,
        message: 'Profile not found'
      }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('engagement_events')
      .insert({
        user_id: user.id,
        entity_type,
        entity_id,
        event_type,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (error) {
      console.error('Track event error:', error)
      return NextResponse.json({
        tracked: false,
        message: error.message
      }, { status: 200 })
    }

    return NextResponse.json({ tracked: true, event: data })
  } catch (error: any) {
    console.error('Track event error:', error)
    return NextResponse.json(
      { tracked: false, message: error.message || 'Failed to track event' },
      { status: 200 }
    )
  }
}
