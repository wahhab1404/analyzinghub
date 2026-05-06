import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { buildTradeMessage } from '@/lib/telegram/trade-message-builder'
import type { TradeFull } from '@/lib/types/trades'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  event_type:    z.enum(['target_hit', 'stop_hit', 'summary', 'update', 'new_high']).default('update'),
  target_index:  z.number().int().min(0).optional(),
  current_price: z.number().positive().optional(),
  custom_message: z.string().max(2000).optional(),
})

// ─── Telegram photo helper ────────────────────────────────────────────────────

async function fetchBotToken(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'telegram_bot_token')
    .maybeSingle()
  return data?.setting_value ?? process.env.TELEGRAM_BOT_TOKEN ?? ''
}

async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  imageUrl: string,
  caption: string
): Promise<{ ok: boolean; messageId: string | null }> {
  let imageBytes: ArrayBuffer | null = null
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) })
    if (imgRes.ok) imageBytes = await imgRes.arrayBuffer()
    else console.warn('[send-update] image fetch failed:', imgRes.status)
  } catch (e) {
    console.warn('[send-update] image fetch error:', e)
  }

  if (imageBytes && imageBytes.byteLength > 0) {
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')
    form.append('photo', new Blob([imageBytes], { type: 'image/png' }), 'trade-update.png')

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST', body: form,
    })
    if (res.ok) {
      const json = await res.json()
      return { ok: true, messageId: json?.result?.message_id?.toString() ?? null }
    }
    console.warn('[send-update] sendPhoto failed:', await res.text())
  }

  // Fallback: plain text
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: 'HTML' }),
  })
  if (res.ok) {
    const json = await res.json()
    return { ok: true, messageId: json?.result?.message_id?.toString() ?? null }
  }
  return { ok: false, messageId: null }
}

// ─── Map event_type → image event param ──────────────────────────────────────

function imageEvent(eventType: string): string {
  switch (eventType) {
    case 'new_high':   return 'new_high'
    case 'target_hit': return 'target_hit'
    case 'stop_hit':   return 'stop_hit'
    default:           return 'new_high' // generic update uses new_high card
  }
}

// ─── POST /api/trades/[id]/send-update ───────────────────────────────────────

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

    const body = bodySchema.parse(await req.json())

    const { data: trade } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        analysis:analyses!analysis_id(id, title),
        option_details:option_trade_details(*)
      `)
      .eq('id', id)
      .single()

    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (trade.user_id !== user.id && roleName !== 'SuperAdmin')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Dedup: prevent sending target_hit twice for the same target
    if (body.event_type === 'target_hit' && body.target_index != null) {
      const { data: dup } = await supabase
        .from('trade_alerts')
        .select('id')
        .eq('trade_id', id)
        .eq('alert_type', 'target_hit')
        .eq('target_index', body.target_index)
        .maybeSingle()
      if (dup) {
        return NextResponse.json({ error: 'Target alert already sent', duplicate: true }, { status: 409 })
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? 'https://analyzinghub.com'

    // Build text caption
    const caption = body.custom_message ?? buildTradeMessage(
      body.event_type as any,
      trade as TradeFull,
      { targetIndex: body.target_index, currentPrice: body.current_price, baseUrl }
    )

    // Build image URL — include live price + target index
    const imgParams = new URLSearchParams({ event: imageEvent(body.event_type) })
    if (body.current_price)  imgParams.set('price', String(body.current_price))
    if (body.target_index != null) imgParams.set('target_index', String(body.target_index))
    const imageUrl = `${baseUrl}/api/trades/${id}/generate-image?${imgParams}`

    // Resolve channel
    let chatId: string | null = null
    let channelDbId: string | null = null
    if (trade.telegram_channel_id) {
      const { data: ch } = await supabase
        .from('analyzer_telegram_channels')
        .select('id, telegram_channel_id')
        .eq('id', trade.telegram_channel_id)
        .maybeSingle()
      if (ch) { chatId = ch.telegram_channel_id; channelDbId = ch.id }
    }

    let telegramMsgId: string | null = null
    let alertStatus: 'sent' | 'failed' = 'failed'

    if (chatId) {
      const botToken = await fetchBotToken(supabase)
      if (botToken) {
        const result = await sendTelegramPhoto(botToken, chatId, imageUrl, caption)
        if (result.ok) { telegramMsgId = result.messageId; alertStatus = 'sent' }
      }
    }

    const alertType = body.event_type === 'update' ? 'update' : body.event_type

    await supabase.from('trade_alerts').insert({
      trade_id:            id,
      alert_type:          alertType,
      target_index:        body.target_index ?? null,
      price:               body.current_price ?? trade.current_price,
      sent_to_channel_id:  channelDbId,
      telegram_message_id: telegramMsgId,
      status:              alertStatus,
    })

    return NextResponse.json({
      success:       true,
      telegram_sent: alertStatus === 'sent',
      image_url:     imageUrl,
    })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/send-update]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
