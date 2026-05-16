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
  event_type: z.enum(['target_hit', 'stop_hit', 'summary', 'update']).default('update'),
  target_index: z.number().int().min(0).optional(),
  current_price: z.number().positive().optional(),
  custom_message: z.string().max(2000).optional(),
})

/**
 * POST /api/trades/[id]/send-update
 * Send a Telegram update for a specific event (target hit, stop, summary, manual update).
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

    // Deduplicate: prevent sending target_hit twice for same target
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://analyzinghub.com'
    const message = body.custom_message ?? buildTradeMessage(
      body.event_type as any,
      trade as TradeFull,
      { targetIndex: body.target_index, currentPrice: body.current_price, baseUrl }
    )

    let chatId: string | null = null
    let channelDbId: string | null = null

    if (trade.telegram_channel_id) {
      const { data: ch } = await supabase
        .from('telegram_channels')
        .select('id, channel_id')
        .eq('id', trade.telegram_channel_id)
        .maybeSingle()
      if (ch) { chatId = ch.channel_id; channelDbId = ch.id }
    }

    let telegramMsgId: string | null = null
    let alertStatus: 'sent' | 'failed' = 'failed'

    if (chatId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-sender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      })
      if (res.ok) {
        const result = await res.json()
        telegramMsgId = result?.result?.message_id?.toString() ?? null
        alertStatus = 'sent'
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

    return NextResponse.json({ success: true, telegram_sent: alertStatus === 'sent' })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/send-update]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
