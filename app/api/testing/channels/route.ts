import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Debug: Log all cookies
    const allCookies = cookieStore.getAll()
    console.log('[GET /api/testing/channels] Cookies present:', allCookies.length)
    console.log('[GET /api/testing/channels] Cookie names:', allCookies.map(c => c.name).join(', '))

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[GET /api/testing/channels] Auth error:', authError)
    }

    if (!user) {
      console.log('[GET /api/testing/channels] No user found in session')
    } else {
      console.log('[GET /api/testing/channels] User authenticated:', user.id)
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: channels, error } = await supabase
      .from('analyzer_testing_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ channels: channels || [] })
  } catch (error) {
    console.error('[GET /api/testing/channels]', error)
    return NextResponse.json(
      { error: 'Failed to fetch testing channels' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Debug: Log all cookies
    const allCookies = cookieStore.getAll()
    console.log('[POST /api/testing/channels] Cookies present:', allCookies.length)
    console.log('[POST /api/testing/channels] Cookie names:', allCookies.map(c => c.name).join(', '))

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[POST /api/testing/channels] Auth error:', authError)
    }

    if (!user) {
      console.log('[POST /api/testing/channels] No user found in session')
    } else {
      console.log('[POST /api/testing/channels] User authenticated:', user.id)
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, telegram_channel_id, telegram_channel_username } = body

    if (!name || !telegram_channel_id) {
      return NextResponse.json(
        { error: 'Name and telegram_channel_id are required' },
        { status: 400 }
      )
    }

    const { count } = await supabase
      .from('analyzer_testing_channels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_enabled', true)

    if (count && count >= 2) {
      return NextResponse.json(
        { error: 'Maximum 2 testing channels allowed per analyzer' },
        { status: 400 }
      )
    }

    const { data: channel, error } = await supabase
      .from('analyzer_testing_channels')
      .insert({
        user_id: user.id,
        name,
        telegram_channel_id,
        telegram_channel_username,
        is_enabled: true,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ channel }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/testing/channels]', error)

    if (error.message?.includes('Maximum 2 testing channels')) {
      return NextResponse.json(
        { error: 'Maximum 2 testing channels allowed per analyzer' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create testing channel' },
      { status: 500 }
    )
  }
}
