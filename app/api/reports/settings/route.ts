import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: settings, error } = await supabase
      .from('report_settings')
      .select('*')
      .eq('analyst_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (!settings) {
      const { data: newSettings, error: insertError } = await supabase
        .from('report_settings')
        .insert({ analyst_id: user.id })
        .select()
        .single()

      if (insertError) throw insertError

      return NextResponse.json(newSettings)
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      enabled,
      language_mode,
      schedule_time,
      timezone,
      default_channel_id,
      extra_channel_ids
    } = body

    const updateData: any = {}
    if (enabled !== undefined) updateData.enabled = enabled
    if (language_mode) updateData.language_mode = language_mode
    if (schedule_time) updateData.schedule_time = schedule_time
    if (timezone) updateData.timezone = timezone
    if (default_channel_id !== undefined) updateData.default_channel_id = default_channel_id
    if (extra_channel_ids !== undefined) updateData.extra_channel_ids = extra_channel_ids

    const { data: settings, error } = await supabase
      .from('report_settings')
      .update(updateData)
      .eq('analyst_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
