import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createServiceRoleClient()

    const { data: trade, error: fetchErr } = await admin
      .from('contract_trades')
      .select('*')
      .eq('id', params.id)
      .eq('author_id', user.id)
      .eq('scope', 'company')
      .single()

    if (fetchErr || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const channelId: string | null = body.channel_id ?? trade.telegram_channel_id ?? null

    if (!channelId) return NextResponse.json({ error: 'No channel specified' }, { status: 400 })

    // Resolve UUID → actual Telegram chat ID
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    let chatId = channelId
    if (uuidRe.test(channelId)) {
      const { data: ch } = await admin
        .from('telegram_channels')
        .select('channel_id')
        .eq('id', channelId)
        .single()
      if (!ch?.channel_id) return NextResponse.json({ error: 'Cannot resolve channel' }, { status: 400 })
      chatId = ch.channel_id
    }

    const { error: outboxErr } = await admin.from('telegram_outbox').insert({
      message_type: 'company_new_trade',
      payload: { trade, isTestingMode: false },
      channel_id: chatId,
      status: 'pending',
      priority: 5,
      next_retry_at: new Date().toISOString(),
    })

    if (outboxErr) return NextResponse.json({ error: outboxErr.message }, { status: 500 })

    // Flush edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ triggered_by: 'company_new_trade' }),
      }).catch(() => undefined)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
