import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Debug: Log all cookies
    const allCookies = cookieStore.getAll()
    console.log('[POST /api/testing/channels/verify] Cookies present:', allCookies.length)
    console.log('[POST /api/testing/channels/verify] Cookie names:', allCookies.map(c => c.name).join(', '))

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[POST /api/testing/channels/verify] Auth error:', authError)
    }

    if (!user) {
      console.log('[POST /api/testing/channels/verify] No user found in session')
    } else {
      console.log('[POST /api/testing/channels/verify] User authenticated:', user.id)
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { telegram_channel_id } = body

    if (!telegram_channel_id) {
      return NextResponse.json(
        { error: 'telegram_channel_id is required' },
        { status: 400 }
      )
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json(
        { error: 'Telegram bot not configured' },
        { status: 500 }
      )
    }

    const chatResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${telegram_channel_id}`
    )
    const chatData = await chatResponse.json()

    if (!chatData.ok) {
      return NextResponse.json(
        {
          error: 'Failed to verify channel',
          details: chatData.description || 'Channel not found or bot not added'
        },
        { status: 400 }
      )
    }

    const membersResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${telegram_channel_id}&user_id=${botToken.split(':')[0]}`
    )
    const membersData = await membersResponse.json()

    const isAdmin = membersData.ok &&
      (membersData.result.status === 'administrator' || membersData.result.status === 'creator')

    if (!isAdmin) {
      return NextResponse.json(
        {
          error: 'Bot must be an administrator in the channel',
          details: 'Please add the bot as an admin to the channel'
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      channel: {
        id: chatData.result.id,
        title: chatData.result.title,
        username: chatData.result.username,
        type: chatData.result.type,
      }
    })
  } catch (error) {
    console.error('[POST /api/testing/channels/verify]', error)
    return NextResponse.json(
      { error: 'Failed to verify channel' },
      { status: 500 }
    )
  }
}
