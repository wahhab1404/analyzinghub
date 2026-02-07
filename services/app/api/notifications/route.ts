import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        notifications: [],
        unread_count: 0
      })
    }

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select(`
        *,
        analyses:analysis_id (
          id,
          direction,
          symbols (
            symbol
          )
        ),
        actor:actor_id (
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Get notifications error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    return NextResponse.json({
      notifications,
      unread_count: count || 0
    })
  } catch (error: any) {
    console.error('Get notifications error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get notifications' },
      { status: 500 }
    )
  }
}
