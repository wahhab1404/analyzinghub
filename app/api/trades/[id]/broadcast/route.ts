import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { buildTradeMessage } from '@/lib/telegram/trade-message-builder'
import type { TradeFull } from '@/lib/types/trades'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function fetchBotToken(supabase: any): Promise<string> {
  const { data } = await supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'telegram_bot_token')
    .maybeSingle()
  return data?.setting_value ?? process.env.TELEGRAM_BOT_TOKEN ?? ''
}

/**
 * Send a photo + caption to a Telegram chat.
 * Falls back to plain text if image generation fails.
 */
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  imageUrl: string,
  caption: string
): Promise<{ ok: boolean; messageId: string | null }> {
  // 1. Fetch the PNG from our generate-image route
  let imageBytes: ArrayBuffer | null = null
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) })
    if (imgRes.ok) {
      imageBytes = await imgRes.arrayBuffer()
    } else {
      console.warn('[broadcast] image fetch failed:', imgRes.status, await imgRes.text())
    }
  } catch (e) {
    console.warn('[broadcast] image fetch error:', e)
  }

  if (imageBytes && imageBytes.byteLength > 0) {
    // 2a. Send as photo via multipart
    const form = new FormData()
    form.append('chat_id', chatId)
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')
    form.append('photo', new Blob([imageBytes], { type: 'image/png' }), 'trade.png')

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: form,
    })
    if (res.ok) {
      const json = await res.json()
      return { ok: true, messageId: json?.result?.message_id?.toString() ?? null }
    }
    console.warn('[broadcast] sendPhoto failed:', await res.text())
  }

  // 2b. Fallback: send plain text
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: 'HTML' }),
  })
  if (res.ok) {
    const json = await res.json()
    return { ok: true, messageId: json?.result?.message_id?.toString() ?? null }
  }
  console.error('[broadcast] sendMessage fallback failed:', await res.text())
  return { ok: false, messageId: null }
}

// ─── POST /api/trades/[id]/broadcast ─────────────────────────────────────────

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

    // Deduplication
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL ?? 'https://analyzinghub.com'

    // Build caption (bilingual text used as Telegram photo caption)
    const caption = buildTradeMessage('new', trade as TradeFull, { baseUrl })

    // Image URL pointing to our generate-image route
    const imageUrl = `${baseUrl}/api/trades/${id}/generate-image?event=new`

    // Resolve Telegram channel
    const channelId = trade.telegram_channel_id
    let channelDbId: string | null = null
    let chatId: string | null = null

    if (channelId) {
      const { data: ch } = await supabase
        .from('analyzer_telegram_channels')
        .select('id, telegram_channel_id')
        .eq('id', channelId)
        .maybeSingle()
      if (ch) { channelDbId = ch.id; chatId = ch.telegram_channel_id }
    }

    let telegramMsgId: string | null = null
    let alertStatus: 'sent' | 'failed' = 'failed'

    if (chatId) {
      const botToken = await fetchBotToken(supabase)
      if (botToken) {
        const result = await sendTelegramPhoto(botToken, chatId, imageUrl, caption)
        if (result.ok) {
          telegramMsgId = result.messageId
          alertStatus = 'sent'
        }
      } else {
        console.warn('[broadcast] No bot token found')
      }
    }

    // Log alert (prevents double-send)
    await supabase.from('trade_alerts').insert({
      trade_id:            id,
      alert_type:          'published',
      price:               trade.entry_price,
      sent_to_channel_id:  channelDbId,
      telegram_message_id: telegramMsgId,
      status:              alertStatus,
    })

    // Publish trade if still draft
    if (trade.status === 'draft') {
      await supabase
        .from('trades')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({
      success:       true,
      telegram_sent: alertStatus === 'sent',
      image_url:     imageUrl,
    })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/broadcast]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
