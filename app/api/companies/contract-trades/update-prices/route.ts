import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || ''
const POLYGON_BASE = 'https://api.polygon.io'

interface ContractTradeRow {
  id: string
  symbol: string
  direction: string
  polygon_option_ticker: string | null
  entry_price: number
  contracts_qty: number
  contract_multiplier: number
  max_price_since_entry: number | null
  targets: Array<{ level?: number; price?: number }> | null
  stoploss: { level?: number; price?: number } | null
  status: string
  telegram_channel_id: string | null
  strike: number
  expiry_date: string
  image_url: string | null
}

async function fetchOptionPrice(underlying: string, ticker: string): Promise<number | null> {
  try {
    const clean = ticker.startsWith('O:') ? ticker : `O:${ticker}`
    const url = `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(clean)}?apiKey=${POLYGON_API_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const r = data?.results
    if (!r) return null
    const bid = r.last_quote?.bid ?? 0
    const ask = r.last_quote?.ask ?? 0
    const last = r.last_trade?.price ?? r.day?.close ?? 0
    if (bid > 0 && ask > 0) return parseFloat(((bid + ask) / 2).toFixed(4))
    if (last > 0) return last
    if (bid > 0) return bid
    return null
  } catch {
    return null
  }
}

/**
 * POST /api/companies/contract-trades/update-prices
 * Refresh current price + high-watermark peak for active company contract
 * deals. Queues Telegram alerts (new high, winning trade) via telegram_outbox.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('Authorization') ?? ''
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()

  const { data: trades, error } = await supabase
    .from('contract_trades')
    .select('id, symbol, direction, polygon_option_ticker, entry_price, contracts_qty, contract_multiplier, max_price_since_entry, targets, stoploss, status, telegram_channel_id, strike, expiry_date, image_url')
    .eq('scope', 'company')
    .eq('status', 'ACTIVE')
    .not('polygon_option_ticker', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const open = (trades || []) as ContractTradeRow[]
  if (open.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // Resolve telegram channel UUID → actual chat ID (cached)
  const channelCache = new Map<string, string | null>()
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  async function resolveChatId(channelId: string | null): Promise<string | null> {
    if (!channelId) return null
    if (channelCache.has(channelId)) return channelCache.get(channelId) ?? null
    let chatId: string | null = channelId
    if (uuidRe.test(channelId)) {
      const { data } = await supabase.from('telegram_channels').select('channel_id').eq('id', channelId).single()
      chatId = data?.channel_id ?? null
    }
    channelCache.set(channelId, chatId)
    return chatId
  }

  // Queue a message in telegram_outbox and flush via edge function
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  async function queueTelegramMessage(
    chatId: string,
    messageType: 'company_new_high' | 'company_winning_trade',
    payload: Record<string, unknown>
  ): Promise<void> {
    const { data: row, error: outboxErr } = await supabase
      .from('telegram_outbox')
      .insert({
        message_type: messageType,
        payload,
        channel_id: chatId,
        status: 'pending',
        priority: 6,
        next_retry_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (outboxErr) {
      console.error(`[update-prices] outbox insert failed (${messageType}):`, outboxErr.message)
      return
    }

    // Fire-and-forget flush
    if (row?.id && supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ triggered_by: messageType }),
      }).catch((e) => console.error('[update-prices] processor flush failed:', e?.message))
    }
  }

  const priceCache = new Map<string, number | null>()
  let updated = 0

  for (const trade of open) {
    const ticker = trade.polygon_option_ticker!
    let price: number | null
    if (priceCache.has(ticker)) {
      price = priceCache.get(ticker) ?? null
    } else {
      price = await fetchOptionPrice(trade.symbol, ticker)
      priceCache.set(ticker, price)
    }
    if (price == null || price <= 0) continue

    const updates: Record<string, unknown> = {
      current_price: price,
      last_price_update_at: new Date().toISOString(),
    }

    // ── High-watermark peak ──────────────────────────────────────────────────
    const prevHigh = trade.max_price_since_entry ?? trade.entry_price
    const isNewHigh = trade.max_price_since_entry == null || price > trade.max_price_since_entry
    if (isNewHigh) {
      updates.max_price_since_entry = price

      // Send peak alert only if price gained ≥0.5% over previous peak
      const gainPct = prevHigh > 0 ? ((price - prevHigh) / prevHigh) * 100 : 100
      if (gainPct >= 0.5 && trade.telegram_channel_id) {
        const chatId = await resolveChatId(trade.telegram_channel_id)
        if (chatId) {
          queueTelegramMessage(chatId, 'company_new_high', {
            trade: { ...trade, current_price: price, max_price_since_entry: price },
            highPrice: price,
            prevHigh,
          }).catch(() => undefined)
        }
      }
    }

    // ── Target / stop auto-close ─────────────────────────────────────────────
    const target = trade.targets?.[0]
    const targetPrice = target?.level ?? target?.price
    const stopPrice = trade.stoploss?.level ?? trade.stoploss?.price
    let shouldClose = false
    let closeReason = ''

    if (targetPrice != null && price >= targetPrice) {
      updates.status = 'CLOSED'
      updates.close_reason = 'TARGET_WIN'
      updates.close_time = new Date().toISOString()
      shouldClose = true
      closeReason = 'TARGET_WIN'
    } else if (stopPrice != null && price <= stopPrice) {
      updates.status = 'CLOSED'
      updates.close_reason = 'STOPLOSS'
      updates.close_time = new Date().toISOString()
      shouldClose = true
      closeReason = 'STOPLOSS'
    }

    const { error: updErr } = await supabase
      .from('contract_trades')
      .update(updates)
      .eq('id', trade.id)

    if (!updErr) {
      updated += 1

      // ── Winning trade announcement ─────────────────────────────────────────
      if (shouldClose && closeReason === 'TARGET_WIN' && trade.telegram_channel_id) {
        const chatId = await resolveChatId(trade.telegram_channel_id)
        if (chatId) {
          queueTelegramMessage(chatId, 'company_winning_trade', {
            trade: {
              ...trade,
              current_price: price,
              max_price_since_entry: Math.max(price, prevHigh),
            },
            closePrice: price,
            close_reason: closeReason,
          }).catch(() => undefined)
        }
      }
    }
  }

  return NextResponse.json({ updated, total: open.length })
}
