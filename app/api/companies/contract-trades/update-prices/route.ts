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
  max_price_since_entry: number | null
  targets: Array<{ level?: number; price?: number }> | null
  stoploss: { level?: number; price?: number } | null
  status: string
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
    .select('id, symbol, direction, polygon_option_ticker, entry_price, max_price_since_entry, targets, stoploss, status')
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

    // High-watermark peak (القمة)
    if (trade.max_price_since_entry == null || price > trade.max_price_since_entry) {
      updates.max_price_since_entry = price
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
