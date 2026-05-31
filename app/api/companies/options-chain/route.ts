import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const POLYGON_API_KEY = process.env.POLYGON_API_KEY
const POLYGON_BASE_URL = 'https://api.polygon.io'

interface StrikeContract {
  strike: number
  ticker: string
  bid?: number
  ask?: number
  mid?: number
  last?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  theta?: number
}

interface ExpirationGroup {
  expirationDate: string
  dte: number
  strikes: StrikeContract[]
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${POLYGON_API_KEY}` },
        cache: 'no-store',
      })
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        continue
      }
      if (!res.ok) throw new Error(`Polygon API ${res.status}: ${res.statusText}`)
      return res.json()
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

async function getStockPrice(symbol: string): Promise<number> {
  const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`
  const data = await fetchWithRetry(url)
  const price =
    data?.ticker?.day?.c ||
    data?.ticker?.prevDay?.c ||
    data?.ticker?.lastTrade?.p
  if (!price) throw new Error(`No price found for ${symbol}`)
  return price
}

/**
 * GET /api/companies/options-chain
 * Fetch live options chain for a stock symbol grouped by expiration date
 *
 * Query params:
 * - symbol: AAPL, TSLA, MSFT... (required)
 * - direction: call | put (required)
 * - maxDTE: max days to expiration (default: 60)
 * - percentBand: % band around ATM price (default: 0.05 = 5%)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!POLYGON_API_KEY) {
      return NextResponse.json({ error: 'Polygon API not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')?.toUpperCase()
    const direction = searchParams.get('direction') as 'call' | 'put'
    const maxDTE = parseInt(searchParams.get('maxDTE') || '60', 10)
    const percentBand = parseFloat(searchParams.get('percentBand') || '0.1')

    if (!symbol || !direction || !['call', 'put'].includes(direction)) {
      return NextResponse.json(
        { error: 'Missing required params: symbol, direction (call|put)' },
        { status: 400 }
      )
    }

    // Get current stock price
    let stockPrice: number
    try {
      stockPrice = await getStockPrice(symbol)
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to fetch price for ${symbol}: ${err.message}` },
        { status: 404 }
      )
    }

    // Build date range
    const today = new Date()
    const minDate = today.toISOString().split('T')[0]
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + maxDTE)
    const maxDateStr = maxDate.toISOString().split('T')[0]

    // Strike band around current price
    const minStrike = stockPrice * (1 - percentBand)
    const maxStrike = stockPrice * (1 + percentBand)

    // Fetch options chain from Polygon
    const params = new URLSearchParams({
      apiKey: POLYGON_API_KEY,
      contract_type: direction,
      'strike_price.gte': minStrike.toFixed(2),
      'strike_price.lte': maxStrike.toFixed(2),
      'expiration_date.gte': minDate,
      'expiration_date.lte': maxDateStr,
      limit: '1000',
    })

    const chainUrl = `${POLYGON_BASE_URL}/v3/snapshot/options/${symbol}?${params}`
    const chainData = await fetchWithRetry(chainUrl)

    if (!chainData?.results?.length) {
      return NextResponse.json({
        symbol,
        stockPrice,
        direction,
        expirations: [],
        metadata: { totalContracts: 0 },
      })
    }

    // Group by expiration date
    const byExpiry = new Map<string, StrikeContract[]>()
    for (const c of chainData.results) {
      const expDate: string = c.details?.expiration_date
      const strike: number = c.details?.strike_price
      if (!expDate || !strike) continue

      const bid = c.last_quote?.bid || 0
      const ask = c.last_quote?.ask || 0
      const last = c.last_trade?.price || 0
      const mid = bid && ask ? (bid + ask) / 2 : last || undefined

      const contract: StrikeContract = {
        strike,
        ticker: c.details?.ticker || c.ticker,
        bid: bid || undefined,
        ask: ask || undefined,
        mid,
        last: last || undefined,
        volume: c.day?.volume || undefined,
        openInterest: c.open_interest || undefined,
        impliedVolatility: c.implied_volatility || undefined,
        delta: c.greeks?.delta || undefined,
        gamma: c.greeks?.gamma || undefined,
        theta: c.greeks?.theta || undefined,
      }

      if (!byExpiry.has(expDate)) byExpiry.set(expDate, [])
      byExpiry.get(expDate)!.push(contract)
    }

    // Sort expirations and strikes
    const todayMs = today.getTime()
    const expirations: ExpirationGroup[] = Array.from(byExpiry.entries())
      .map(([expirationDate, strikes]) => {
        const expMs = new Date(expirationDate + 'T00:00:00Z').getTime()
        const dte = Math.round((expMs - todayMs) / (1000 * 60 * 60 * 24))
        strikes.sort((a, b) => a.strike - b.strike)
        return { expirationDate, dte, strikes }
      })
      .sort((a, b) => a.dte - b.dte)

    return NextResponse.json(
      {
        symbol,
        stockPrice,
        direction,
        expirations,
        metadata: {
          totalContracts: chainData.results.length,
          percentBand,
          minStrike,
          maxStrike,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache',
        },
      }
    )
  } catch (error: any) {
    console.error('[Company Options Chain] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
