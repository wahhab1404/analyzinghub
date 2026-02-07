import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      })
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { channelId } = body

    if (!channelId) {
      return NextResponse.json(
        { error: 'Channel ID or username is required' },
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
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${channelId}`
    )

    if (!chatResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch channel information' },
        { status: 400 }
      )
    }

    const chatData = await chatResponse.json()
    if (!chatData.ok) {
      return NextResponse.json(
        { error: 'Invalid channel ID or bot not added to channel' },
        { status: 400 }
      )
    }

    const chat = chatData.result
    const botId = botToken.split(':')[0]

    const memberResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${channelId}&user_id=${botId}`
    )

    if (!memberResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to verify bot membership' },
        { status: 400 }
      )
    }

    const memberData = await memberResponse.json()
    if (!memberData.ok) {
      return NextResponse.json(
        { error: 'Bot is not a member of this channel' },
        { status: 400 }
      )
    }

    const member = memberData.result
    const isAdmin = member.status === 'administrator' || member.status === 'creator'

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Bot must be an administrator in the channel' },
        { status: 400 }
      )
    }

    const canInviteUsers = member.can_invite_users !== false

    if (!canInviteUsers) {
      return NextResponse.json(
        { error: 'Bot needs permission to invite users' },
        { status: 400 }
      )
    }

    const { data: existingChannel } = await supabase
      .from('telegram_channels')
      .select('id, user_id')
      .eq('channel_id', chat.id.toString())
      .maybeSingle()

    if (existingChannel) {
      if (existingChannel.user_id !== user.id) {
        return NextResponse.json(
          { error: 'This channel is already linked to another account' },
          { status: 400 }
        )
      }

      await supabase
        .from('telegram_channels')
        .update({
          channel_name: chat.title,
          username: chat.username || null,
        })
        .eq('id', existingChannel.id)
    }

    return NextResponse.json({
      ok: true,
      isAdmin: true,
      canInviteUsers: true,
      channelInfo: {
        id: chat.id.toString(),
        title: chat.title,
        username: chat.username,
        type: chat.type,
      },
    })
  } catch (error) {
    console.error('Channel verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
