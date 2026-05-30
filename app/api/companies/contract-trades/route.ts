import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateAndUploadContractTradeImage } from '@/lib/companies/contract-trade-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Generate the alert image, queue a `company_new_trade` Telegram message for the
 * resolved channels and immediately flush the outbox. Mirrors the index /
 * company-analysis publish paths. No-op when auto_publish_telegram is false.
 * Never throws.
 */
async function publishContractDealToTelegram(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  trade: Record<string, unknown>,
  opts: {
    auto_publish_telegram?: boolean
    telegram_channel_id?: string | null
    is_testing?: boolean
    testing_channel_ids?: string[]
    image_url?: string | null
  }
): Promise<void> {
  if (!opts.auto_publish_telegram) return

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[contract-publish] Supabase service credentials missing — cannot publish')
    return
  }

  try {
    // Resolve target chat IDs (testing channels or a single production channel)
    const channelsToPublish: string[] = []

    if (opts.is_testing && opts.testing_channel_ids && opts.testing_channel_ids.length > 0) {
      for (const channelUuid of opts.testing_channel_ids) {
        if (UUID_RE.test(channelUuid)) {
          const { data: testChannel } = await serviceClient
            .from('analyzer_testing_channels')
            .select('telegram_channel_id')
            .eq('id', channelUuid)
            .eq('is_enabled', true)
            .single()
          if (testChannel?.telegram_channel_id) channelsToPublish.push(testChannel.telegram_channel_id)
        } else {
          channelsToPublish.push(channelUuid)
        }
      }
    } else if (opts.telegram_channel_id) {
      const id = opts.telegram_channel_id
      if (UUID_RE.test(id)) {
        const { data: channel } = await serviceClient
          .from('telegram_channels')
          .select('channel_id')
          .eq('id', id)
          .single()
        if (channel?.channel_id) channelsToPublish.push(channel.channel_id)
      } else {
        channelsToPublish.push(id)
      }
    }

    if (channelsToPublish.length === 0) {
      console.warn('[contract-publish] auto_publish_telegram=true but no channels resolved')
      return
    }

    const tradeWithImage = { ...trade, image_url: opts.image_url ?? trade.image_url ?? null }
    const outboxIds: string[] = []

    for (const chatId of channelsToPublish) {
      const { data: row, error: outboxErr } = await serviceClient
        .from('telegram_outbox')
        .insert({
          message_type: 'company_new_trade',
          payload: { trade: tradeWithImage, isTestingMode: opts.is_testing || false },
          channel_id: chatId,
          status: 'pending',
          priority: 5,
          next_retry_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (outboxErr) {
        console.error(`[contract-publish] outbox insert failed for ${chatId}:`, outboxErr.message)
      } else if (row?.id) {
        outboxIds.push(row.id)
      }
    }

    // Fire-and-forget flush so the post is sent without waiting for the cron cycle
    if (outboxIds.length > 0) {
      fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ triggered_by: 'company_contract_create' }),
      }).catch((e) => console.error('[contract-publish] processor trigger failed:', e?.message))
    }
  } catch (err) {
    console.error('[contract-publish] error:', err instanceof Error ? err.message : err)
  }
}

/**
 * GET /api/companies/contract-trades
 * List the authenticated user's company option-contract deals (standalone +
 * analysis-linked) from the unified `contract_trades` table.
 */
export async function GET() {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: trades, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('author_id', user.id)
      .eq('scope', 'company')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[contract-trades] list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trades: trades || [] })
  } catch (error) {
    console.error('[contract-trades] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/companies/contract-trades
 * Create a standalone company option-contract deal (no analysis required).
 * Persists the Polygon option ticker so the Fly.io tracker + cron can follow
 * the price and high-watermark peak live.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      symbol,
      direction,
      strike,
      expiry_date,
      polygon_option_ticker,
      entry_price,
      contracts_qty,
      targets,
      stoploss,
      notes,
      underlying_price,
      // Telegram publishing
      auto_publish_telegram,
      telegram_channel_id,
      is_testing,
      testing_channel_ids,
    } = body

    if (!symbol || !direction || strike == null || !expiry_date || !entry_price) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, direction, strike, expiry_date, entry_price' },
        { status: 400 }
      )
    }

    const normalizedDirection = String(direction).toUpperCase()
    if (!['CALL', 'PUT'].includes(normalizedDirection)) {
      return NextResponse.json({ error: 'direction must be CALL or PUT' }, { status: 400 })
    }

    const entry = Number(entry_price)
    if (!Number.isFinite(entry) || entry <= 0) {
      return NextResponse.json({ error: 'Invalid entry_price' }, { status: 400 })
    }

    const insertData = {
      scope: 'company' as const,
      analysis_id: null,
      author_id: user.id,
      created_by: user.id,
      symbol: String(symbol).toUpperCase(),
      direction: normalizedDirection,
      strike: Number(strike),
      expiry_date,
      polygon_option_ticker: polygon_option_ticker || null,
      entry_price: entry,
      contracts_qty: contracts_qty ? Number(contracts_qty) : 1,
      contract_multiplier: 100,
      status: 'ACTIVE' as const,
      current_price: entry,
      max_price_since_entry: entry,
      underlying_price: underlying_price != null ? Number(underlying_price) : null,
      last_price_update_at: new Date().toISOString(),
      targets: targets || [],
      stoploss: stoploss || null,
      notes: notes || null,
      idempotency_key: `${user.id}_${polygon_option_ticker || `${symbol}_${strike}_${expiry_date}`}_${Date.now()}`,
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .insert([insertData])
      .select()
      .single()

    if (error) {
      // Unique active-contract index → friendly conflict
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'You already have an active deal for this exact contract' },
          { status: 409 }
        )
      }
      console.error('[contract-trades] create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Image + Telegram publishing ─────────────────────────────────────────
    // Generate the alert card and publish it (same approach as index trades).
    // Best-effort: never blocks the trade creation response on failure.
    if (auto_publish_telegram) {
      const serviceClient = createServiceRoleClient()
      let imageUrl: string | null = null
      try {
        imageUrl = await generateAndUploadContractTradeImage(serviceClient, trade.id, trade)
        if (imageUrl) {
          await serviceClient
            .from('contract_trades')
            .update({ image_url: imageUrl })
            .eq('id', trade.id)
          trade.image_url = imageUrl
        }
      } catch (imgErr) {
        console.error('[contract-trades] image generation failed (non-fatal):', imgErr)
      }

      await publishContractDealToTelegram(serviceClient, trade, {
        auto_publish_telegram,
        telegram_channel_id,
        is_testing,
        testing_channel_ids,
        image_url: imageUrl,
      })
    }

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error) {
    console.error('[contract-trades] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
