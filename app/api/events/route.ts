import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { entity_type, entity_id, event_type, metadata } = body

    if (!entity_type || !entity_id || !event_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const validEntityTypes = ['analysis', 'analyzer', 'symbol']
    const validEventTypes = ['view', 'like', 'bookmark', 'comment', 'follow', 'share', 'unlike', 'unbookmark', 'unfollow']

    if (!validEntityTypes.includes(entity_type)) {
      return NextResponse.json(
        { error: 'Invalid entity_type' },
        { status: 400 }
      )
    }

    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: 'Invalid event_type' },
        { status: 400 }
      )
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ event: data })
  } catch (error: any) {
    console.error('Track event error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to track event' },
      { status: 500 }
    )
  }
}
