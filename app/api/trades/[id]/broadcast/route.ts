import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { buildTradeMessage } from '@/lib/telegram/trade-message-builder'
import { getBotToken, sendMessage, sendPhoto } from '@/lib/telegram/bot-sender'
import { renderContractTradePng } from '@/lib/companies/contract-trade-image'
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

    // Internal/server invocation: a caller holding the CRON_SECRET (cron jobs,
    // automated re-broadcast) may publish without a browser session. Normal
    // requests still require an authenticated SuperAdmin/Analyzer.
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers.get('Authorization') ?? ''
    const isInternal = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`

    let userId: string | null = null
    let isSuperAdmin = false

    if (!isInternal) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id

      const { data: profile } = await supabase
        .from('profiles').select('roles(name)').eq('id', user.id).single()
      const roleName = (profile as any)?.roles?.name as string | undefined
      if (!['SuperAdmin', 'Analyzer'].includes(roleName ?? ''))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      isSuperAdmin = roleName === 'SuperAdmin'
    }

    // Use a service-role client for DB reads/writes when invoked internally
    // (no user session → RLS would otherwise block the lookups).
    const db = isInternal ? createServiceRoleClient() : supabase

    // Check for duplicate published alert
    const { data: existingAlert } = await db
      .from('trade_alerts')
      .select('id')
      .eq('trade_id', id)
      .eq('alert_type', 'published')
      .maybeSingle()

    if (existingAlert) {
      return NextResponse.json({ error: 'Trade already broadcast', duplicate: true }, { status: 409 })
    }

    const { data: trade, error } = await db
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

    if (!isInternal && trade.user_id !== userId && !isSuperAdmin)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Build the Telegram message
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://analyzinghub.com'
    const message = buildTradeMessage('new', trade as TradeFull, { baseUrl })

    // Resolve which channel to send to
    const channelId = trade.telegram_channel_id
    let telegramChannelDbId: string | null = null
    let chatId: string | null = null

    if (channelId) {
      const { data: ch } = await db
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
    let imageError: string | null = null

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
        // Render an alert-card image for option trades and send it as a photo
        // (same card style as index/company contract deals). Stock trades and
        // any image-generation failure fall back to the text message, so a
        // broadcast is never dropped just because the image couldn't render.
        let photoBytes: Uint8Array | null = null
        if (trade.trade_type === 'option') {
          const od = Array.isArray(trade.option_details)
            ? trade.option_details[0]
            : trade.option_details
          try {
            const png = await renderContractTradePng({
              symbol: trade.symbol,
              strike: od?.strike_price ?? null,
              direction: trade.direction,
              expiry_date: od?.expiration_date ?? null,
              entry_price: trade.entry_price ?? od?.entry_premium ?? 0,
              current_price: trade.current_price ?? null,
              max_price_since_entry: od?.highest_premium_since_entry ?? null,
              status: trade.status,
            })
            photoBytes = new Uint8Array(png)
          } catch (imgErr: any) {
            imageError = imgErr?.message || String(imgErr)
            console.error('[broadcast] image render failed (falling back to text):', imgErr)
          }
        }

        const msgId = photoBytes
          ? await sendPhoto(botToken, chatId, photoBytes, message)
          : await sendMessage(botToken, chatId, message)

        if (msgId != null) {
          telegramMsgId = String(msgId)
          alertStatus = 'sent'
        } else if (photoBytes) {
          // Photo send failed — last-ditch text fallback
          const textId = await sendMessage(botToken, chatId, message)
          if (textId != null) {
            telegramMsgId = String(textId)
            alertStatus = 'sent'
          } else {
            console.error('[broadcast] both photo and text send failed')
          }
        } else {
          console.error('[broadcast] sendMessage returned null (Telegram API rejected the send)')
        }
      }
    }

    // Log the alert regardless (prevent double-send)
    await db.from('trade_alerts').insert({
      trade_id:            id,
      alert_type:          'published',
      price:               trade.entry_price,
      sent_to_channel_id:  telegramChannelDbId,
      telegram_message_id: telegramMsgId,
      status:              alertStatus,
    })

    // DIAGNOSTIC: persist any image-render error onto the trade so it can be
    // inspected server-side (no Netlify function logs available).
    if (imageError) {
      await db
        .from('trades')
        .update({ broadcast_image_error: imageError })
        .eq('id', id)
    }

    // Update trade: mark as published + set published_at
    if (trade.status === 'draft') {
      await db
        .from('trades')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({
      success: true,
      telegram_sent: alertStatus === 'sent',
      sent_as: telegramMsgId && imageError == null && trade.trade_type === 'option' ? 'photo' : 'text',
      image_error: imageError,
      message_preview: message.slice(0, 200),
    })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/broadcast]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
