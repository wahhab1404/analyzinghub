import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fetch the latest premium for a single option contract from Polygon's
 * options snapshot. Mirrors the logic in the trades-price-tracker edge
 * function — using the underlying stock price as the premium is wrong;
 * the contract's own quote is what the analyst tracks.
 */
async function fetchOptionPremium(
  underlying: string,
  contract: string,
  polygonKey: string
): Promise<number | null> {
  try {
    const u = underlying.replace(/^O:/, '').toUpperCase()
    const c = contract.startsWith('O:') ? contract : `O:${contract}`
    const res = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(u)}/${encodeURIComponent(c)}?apiKey=${polygonKey}`,
      { next: { revalidate: 0 } }
    )
    if (!res.ok) return null
    const json = await res.json()
    const r = json?.results
    if (!r) return null

    const bid = Number(r.last_quote?.bid ?? 0)
    const ask = Number(r.last_quote?.ask ?? 0)
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : Number(r.last_quote?.midpoint ?? 0) || 0
    const last = Number(r.last_trade?.price ?? 0)
    const close = Number(r.day?.close ?? r.session?.close ?? 0)

    const premium = mid > 0 ? mid : last > 0 ? last : close > 0 ? close : 0
    return premium > 0 ? parseFloat(premium.toFixed(4)) : null
  } catch {
    return null
  }
}

/**
 * POST /api/trades/update-prices
 * Called by cron / edge function to refresh current prices for all active trades.
 * Uses service role (requires Authorization: Bearer <CRON_SECRET>).
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const polygonKey   = process.env.POLYGON_API_KEY

  const supabase = createClient(supabaseUrl, serviceKey)

  // Fetch all active / published trades with a symbol, including option contract info
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, symbol, trade_type, status, option_details:option_trade_details(contract_symbol, underlying_symbol)')
    .in('status', ['published', 'active'])
    .eq('is_testing', false)

  if (error) {
    console.error('[update-prices]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!trades || trades.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // Batch-fetch stock snapshot prices for non-option trades only.
  const stockSymbols = [
    ...new Set(
      trades.filter(t => t.trade_type !== 'option').map(t => t.symbol)
    ),
  ]
  const stockPrices: Record<string, number> = {}

  if (polygonKey && stockSymbols.length > 0) {
    try {
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${stockSymbols.join(',')}&apiKey=${polygonKey}`,
        { next: { revalidate: 0 } }
      )
      if (res.ok) {
        const json = await res.json()
        for (const ticker of json.tickers ?? []) {
          const p = ticker.day?.c ?? ticker.prevDay?.c ?? 0
          if (p && p > 0) stockPrices[ticker.ticker] = p
        }
      }
    } catch (e) {
      console.error('[update-prices] polygon fetch failed', e)
    }
  }

  let updatedCount = 0
  const results = []

  for (const trade of trades) {
    const isOption = trade.trade_type === 'option'

    // Normalize the embedded option details (Supabase returns it as an
    // array for the embedded relation depending on the client version).
    const details = Array.isArray(trade.option_details)
      ? trade.option_details[0]
      : (trade.option_details as { contract_symbol?: string; underlying_symbol?: string } | null)

    // Resolve the price relevant to this trade: the option contract premium
    // for options, the underlying stock price for stocks.
    let price: number | null = null
    if (isOption) {
      const contract   = details?.contract_symbol
      const underlying = details?.underlying_symbol ?? trade.symbol
      if (polygonKey && contract) {
        price = await fetchOptionPremium(underlying, contract, polygonKey)
      }
    } else {
      const p = stockPrices[trade.symbol]
      price = p && p > 0 ? p : null
    }

    if (!price || price <= 0) continue

    const { data: result, error: rpcError } = isOption
      ? await supabase.rpc('update_option_trade_price', {
          p_trade_id:        trade.id,
          p_current_premium: price,
        })
      : await supabase.rpc('update_trade_price', {
          p_trade_id:      trade.id,
          p_current_price: price,
        })

    if (rpcError) {
      console.error(`[update-prices] RPC error for ${trade.id}:`, rpcError)
      results.push({ id: trade.id, error: rpcError.message })
    } else {
      updatedCount++
      results.push({ id: trade.id, ...result })
    }
  }

  return NextResponse.json({ updated: updatedCount, results })
}
