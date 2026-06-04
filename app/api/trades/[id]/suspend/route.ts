import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { buildTradeMessage } from '@/lib/telegram/trade-message-builder'
import { getBotToken, sendMessage } from '@/lib/telegram/bot-sender'
import type { TradeFull } from '@/lib/types/trades'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  action: z.enum(['suspend', 'resume']).default('suspend'),
  reason: z.string().max(500).optional(),
})

/**
 * POST /api/trades/[id]/suspend
 *
 * Manually suspend (or resume) a trade. A suspended trade keeps its row but is
 * excluded from the price tracker (which only updates status 'published' /
 * 'active'), so the platform stops following it. A Telegram notice is sent to
 * the trade's channel on both suspend and resume.
 *
 * Allowed for the trade owner or a SuperAdmin.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('roles(name)')
      .eq('id', user.id)
      .single()
    const roleName = (profile as any)?.roles?.name as string | undefined

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }
    const { action, reason } = parsed.data

    const { data: trade, error } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        option_details:option_trade_details(*)
      `)
      .eq('id', id)
      .single()

    if (error || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (roleName !== 'SuperAdmin' && trade.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date().toISOString()

    if (action === 'suspend') {
      if (trade.status === 'suspended') {
        return NextResponse.json({ error: 'Trade is already suspended' }, { status: 409 })
      }
      if (!['published', 'active'].includes(trade.status)) {
        return NextResponse.json(
          { error: `Only published/active trades can be suspended (current status: ${trade.status})` },
          { status: 409 }
        )
      }
    } else if (trade.status !== 'suspended') {
      return NextResponse.json(
        { error: `Only suspended trades can be resumed (current status: ${trade.status})` },
        { status: 409 }
      )
    }

    const dbUpdates =
      action === 'suspend'
        ? {
            status: 'suspended',
            suspended_at: now,
            suspended_by: user.id,
            suspension_reason: reason || null,
            suspension_mode: 'manual',
          }
        : {
            status: 'active',
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
            suspension_mode: null,
          }

    const { data: updated, error: updateError } = await supabase
      .from('trades')
      .update(dbUpdates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[POST /api/trades/[id]/suspend]', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Send a Telegram notice (best-effort — never block the suspension on it).
    let telegramSent = false
    if (trade.telegram_channel_id) {
      try {
        const { data: ch } = await supabase
          .from('telegram_channels')
          .select('channel_id')
          .eq('id', trade.telegram_channel_id)
          .maybeSingle()

        if (ch?.channel_id) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
          const botToken = await getBotToken(supabaseUrl, serviceKey)
          if (botToken) {
            const message = buildTradeMessage(
              action === 'suspend' ? 'suspended' : 'resumed',
              trade as TradeFull,
              { reason }
            )
            const msgId = await sendMessage(botToken, ch.channel_id, message)
            telegramSent = msgId != null

            await supabase.from('trade_alerts').insert({
              trade_id: id,
              alert_type: action === 'suspend' ? 'suspended' : 'resumed',
              price: trade.current_price,
              sent_to_channel_id: trade.telegram_channel_id,
              telegram_message_id: msgId != null ? String(msgId) : null,
              status: msgId != null ? 'sent' : 'failed',
            })
          }
        }
      } catch (telegramErr: any) {
        console.error('[POST /api/trades/[id]/suspend] telegram failed:', telegramErr?.message)
      }
    }

    return NextResponse.json({ trade: updated, action, telegram_sent: telegramSent })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/suspend]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
