import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('[Tutorial Complete API] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ tutorial_completed: true })
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Tutorial Complete API] Database error:', {
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

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[Tutorial Complete API] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update tutorial status' },
      { status: 500 }
    )
  }
}
