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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Get notification preferences error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!preferences) {
      const { data: newPreferences, error: insertError } = await supabase
        .from('notification_preferences')
        .insert({ user_id: user.id })
        .select()
        .single()

      if (insertError) {
        console.error('Create notification preferences error:', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      return NextResponse.json({ preferences: newPreferences })
    }

    return NextResponse.json({ preferences })
  } catch (error: any) {
    console.error('Get notification preferences error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get notification preferences' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      alerts_enabled,
      target_alerts_enabled,
      stop_alerts_enabled,
      telegram_enabled,
      telegram_target_hit,
      telegram_stop_hit,
      telegram_new_analysis,
      quiet_hours_start,
      quiet_hours_end
    } = body

    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .update({
        alerts_enabled,
        target_alerts_enabled,
        stop_alerts_enabled,
        telegram_enabled,
        telegram_target_hit,
        telegram_stop_hit,
        telegram_new_analysis,
        quiet_hours_start,
        quiet_hours_end
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update notification preferences error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ preferences })
  } catch (error: any) {
    console.error('Update notification preferences error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
}
