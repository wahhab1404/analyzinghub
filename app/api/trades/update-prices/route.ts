import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  // Fetch all active / published trades with a symbol
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, symbol, trade_type, direction, entry_price, stop_loss, highest_price_since_entry, lowest_price_since_entry, targets, status')
    .in('status', ['published', 'active'])
    .eq('is_testing', false)

  if (error) {
    console.error('[update-prices]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!trades || trades.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // Deduplicate symbols
  const symbols = [...new Set(trades.map(t => t.symbol))]
  const prices: Record<string, number> = {}

  // Fetch prices from Polygon snapshot (batch)
  if (polygonKey && symbols.length > 0) {
    try {
      const symbolList = symbols.join(',')
      const res = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbolList}&apiKey=${polygonKey}`,
        { next: { revalidate: 0 } }
      )
      if (res.ok) {
        const json = await res.json()
        for (const ticker of json.tickers ?? []) {
          prices[ticker.ticker] = ticker.day?.c ?? ticker.prevDay?.c ?? 0
        }
      }
    } catch (e) {
      console.error('[update-prices] polygon fetch failed', e)
    }
  }

  let updatedCount = 0
  const results = []

  for (const trade of trades) {
    const price = prices[trade.symbol]
    if (!price || price <= 0) continue

    const rpc = trade.trade_type === 'option' ? 'update_option_trade_price' : 'update_trade_price'
    const { data: result, error: rpcError } = await supabase.rpc(rpc, {
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
