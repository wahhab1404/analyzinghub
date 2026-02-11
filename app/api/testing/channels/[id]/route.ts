import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[PATCH /api/testing/channels/[id]] Auth error:', authError)
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, telegram_channel_username, is_enabled } = body

    const { data: existingChannel } = await supabase
      .from('analyzer_testing_channels')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (!existingChannel) {
      return NextResponse.json(
        { error: 'Testing channel not found or access denied' },
        { status: 404 }
      )
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (telegram_channel_username !== undefined) updateData.telegram_channel_username = telegram_channel_username
    if (is_enabled !== undefined) updateData.is_enabled = is_enabled

    const { data: channel, error } = await supabase
      .from('analyzer_testing_channels')
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ channel })
  } catch (error: any) {
    console.error('[PATCH /api/testing/channels/[id]]', error)

    if (error.message?.includes('Maximum 2 testing channels')) {
      return NextResponse.json(
        { error: 'Maximum 2 testing channels allowed per analyzer' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update testing channel' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[DELETE /api/testing/channels/[id]] Auth error:', authError)
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('analyzer_testing_channels')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/testing/channels/[id]]', error)
    return NextResponse.json(
      { error: 'Failed to delete testing channel' },
      { status: 500 }
    )
  }
}
