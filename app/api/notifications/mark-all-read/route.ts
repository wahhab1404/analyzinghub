import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Mark all notifications auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error, count } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error('Mark all notifications read error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        userId: user.id
      })
      return NextResponse.json({
        error: error.message,
        details: error.details
      }, { status: 500 })
    }

    return NextResponse.json({ success: true, count })
  } catch (error: any) {
    console.error('Mark all notifications unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to mark all notifications as read' },
      { status: 500 }
    )
  }
}
