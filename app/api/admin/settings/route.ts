import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        role_id,
        roles!inner(name)
      `)
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.roles as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: settings, error } = await supabase
      .from('admin_settings')
      .select('*')
      .order('setting_key')

    if (error) {
      console.error('Error fetching admin settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, settings })
  } catch (err: any) {
    console.error('ADMIN_SETTINGS_GET_ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select(`
        role_id,
        roles!inner(name)
      `)
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.roles as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { settingKey, settingValue } = body

    if (!settingKey) {
      return NextResponse.json({ error: 'Setting key is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert(
        {
          setting_key: settingKey,
          setting_value: settingValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'setting_key',
        }
      )
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating admin setting:', error)
      return NextResponse.json({ error: error.message || 'Failed to update setting' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, setting: data })
  } catch (err: any) {
    console.error('ADMIN_SETTINGS_PATCH_ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
