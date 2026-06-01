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
 * deals, auto-closing trades that hit a target or stop. Acts as the cron
 * fallback for the Fly.io live tracker.
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
    .select('id, symbol, direction, polygon_option_ticker, entry_price, contracts_qty, contract_multiplier, max_price_since_entry, targets, stoploss, status, telegram_channel_id, strike, expiry_date')
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

  const priceCache = new Map<string, number | null>()
  let updated = 0

  // Resolve telegram chat IDs for channels (cache by UUID)
  const channelCache = new Map<string, string | null>()
  async function resolveChatId(channelId: string | null): Promise<string | null> {
    if (!channelId) return null
    if (channelCache.has(channelId)) return channelCache.get(channelId) ?? null
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(channelId)) {
      const { data } = await supabase.from('telegram_channels').select('channel_id').eq('id', channelId).single()
      const chat = data?.channel_id ?? null
      channelCache.set(channelId, chat)
      return chat
    }
    channelCache.set(channelId, channelId)
    return channelId
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  async function sendNewHighAlert(trade: ContractTradeRow, price: number, prevHigh: number): Promise<void> {
    if (!trade.telegram_channel_id || !supabaseUrl || !serviceRoleKey) return
    const chatId = await resolveChatId(trade.telegram_channel_id)
    if (!chatId) return

    // Deduplicate: only send if this price is at least 10% above previous high
    const gainPct = prevHigh > 0 ? ((price - prevHigh) / prevHigh) * 100 : 0
    if (gainPct < 10) return

    const qty = trade.contracts_qty ?? 1
    const multiplier = trade.contract_multiplier ?? 100
    const pnl = (price - trade.entry_price) * qty * multiplier
    const pnlPct = trade.entry_price > 0 ? ((price - trade.entry_price) / trade.entry_price) * 100 : 0

    const dir = trade.direction === 'CALL' ? '📈 CALL' : '📉 PUT'
    const message = `🏆 *New Peak Alert!*\n\n${dir} *${trade.symbol}* $${trade.strike}\nExp: ${trade.expiry_date}\n\n📊 Contract price: *$${price.toFixed(2)}* (prev peak: $${prevHigh.toFixed(2)})\n💰 P/L: *${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}* (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`

    try {
      await fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          triggered_by: 'company_new_high',
          direct_message: { chat_id: chatId, text: message, parse_mode: 'Markdown' },
        }),
      })
    } catch (e) {
      console.error('[update-prices] failed to send new-high alert:', e)
    }
  }

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

    // High-watermark peak (القمة) — send Telegram alert on new high
    const prevHigh = trade.max_price_since_entry ?? trade.entry_price
    if (trade.max_price_since_entry == null || price > trade.max_price_since_entry) {
      updates.max_price_since_entry = price
      // Send alert (fire-and-forget)
      sendNewHighAlert(trade, price, prevHigh).catch(() => undefined)
    }

    // Target / stop auto-close (option premium semantics)
    const target = trade.targets?.[0]
    const targetPrice = target?.level ?? target?.price
    const stopPrice = trade.stoploss?.level ?? trade.stoploss?.price
    if (targetPrice != null && price >= targetPrice) {
      updates.status = 'CLOSED'
      updates.close_reason = 'TARGET_WIN'
      updates.close_time = new Date().toISOString()
    } else if (stopPrice != null && price <= stopPrice) {
      updates.status = 'CLOSED'
      updates.close_reason = 'STOPLOSS'
      updates.close_time = new Date().toISOString()
    }

    const { error: updErr } = await supabase
      .from('contract_trades')
      .update(updates)
      .eq('id', trade.id)

    if (!updErr) updated += 1
  }

  return NextResponse.json({ updated, total: open.length })
}
