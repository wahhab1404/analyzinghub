import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { buildTradeMessage } from '@/lib/telegram/trade-message-builder'
import { getBotToken, sendMessage } from '@/lib/telegram/bot-sender'
import type { TradeFull } from '@/lib/types/trades'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/trades/[id]/broadcast
 * Publish a trade to its Telegram channel and create a trade_alerts record.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('roles(name)').eq('id', user.id).single()
    const roleName = (profile as any)?.roles?.name as string | undefined
    if (!['SuperAdmin', 'Analyzer'].includes(roleName ?? ''))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Check for duplicate published alert
    const { data: existingAlert } = await supabase
      .from('trade_alerts')
      .select('id')
      .eq('trade_id', id)
      .eq('alert_type', 'published')
      .maybeSingle()

    if (existingAlert) {
      return NextResponse.json({ error: 'Trade already broadcast', duplicate: true }, { status: 409 })
    }

    const { data: trade, error } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        analysis:analyses!analysis_id(id, title),
        option_details:option_trade_details(*),
        plan:analyzer_plans!plan_id(id, name)
      `)
      .eq('id', id)
      .single()

    if (error || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })

    if (trade.user_id !== user.id && roleName !== 'SuperAdmin')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Build the Telegram message
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://analyzinghub.com'
    const message = buildTradeMessage('new', trade as TradeFull, { baseUrl })

    // Resolve which channel to send to
    const channelId = trade.telegram_channel_id
    let telegramChannelDbId: string | null = null
    let chatId: string | null = null

    if (channelId) {
      const { data: ch } = await supabase
        .from('telegram_channels')
        .select('id, channel_id')
        .eq('id', channelId)
        .maybeSingle()
      if (ch) {
        telegramChannelDbId = ch.id
        chatId = ch.channel_id
      }
    }

    let telegramMsgId: string | null = null
    let alertStatus: 'sent' | 'failed' = 'failed'

    if (chatId) {
      // Send directly to the channel via the Telegram Bot API.
      //
      // NOTE: we deliberately do NOT use the `telegram-sender` edge function
      // here — that function is built for per-user notifications (it expects a
      // { userId, type } payload and looks up a personal telegram_accounts row),
      // so sending a channel { chat_id, text } payload to it always 404s and the
      // broadcast silently fails. Resolving the bot token and calling sendMessage
      // directly is the same mechanism the rest of the bot uses for channels.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!

      const botToken = await getBotToken(supabaseUrl, serviceKey)
      if (!botToken) {
        console.error('[broadcast] bot token not configured')
      } else {
        const msgId = await sendMessage(botToken, chatId, message)
        if (msgId != null) {
          telegramMsgId = String(msgId)
          alertStatus = 'sent'
        } else {
          console.error('[broadcast] sendMessage returned null (Telegram API rejected the send)')
        }
      }
    }

    // Log the alert regardless (prevent double-send)
    await supabase.from('trade_alerts').insert({
      trade_id:            id,
      alert_type:          'published',
      price:               trade.entry_price,
      sent_to_channel_id:  telegramChannelDbId,
      telegram_message_id: telegramMsgId,
      status:              alertStatus,
    })

    // Update trade: mark as published + set published_at
    if (trade.status === 'draft') {
      await supabase
        .from('trades')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({
      success: true,
      telegram_sent: alertStatus === 'sent',
      message_preview: message.slice(0, 200),
    })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/broadcast]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
