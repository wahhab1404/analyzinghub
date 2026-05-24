import { NextRequest, NextResponse } from 'next/server'
import { analyzeMarket, CandleData } from '@/lib/neural-analysis/computations'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY
const POLYGON_BASE = 'https://api.polygon.io'

const SYMBOL_MAP: Record<string, string> = {
  SPX: 'I:SPX',
  SPX500: 'I:SPX',
  NDX: 'I:NDX',
  NASDAQ: 'I:NDX',
  DJI: 'I:DJI',
  DOW: 'I:DJI',
}

const TIMEFRAME_CONFIG: Record<string, { multiplier: number; timespan: string; lookbackDays: number }> = {
  '1d':  { multiplier: 1, timespan: 'day',  lookbackDays: 365 * 5 },
  '4h':  { multiplier: 4, timespan: 'hour', lookbackDays: 180 },
  '1h':  { multiplier: 1, timespan: 'hour', lookbackDays: 90 },
}

async function fetchCandles(ticker: string, multiplier: number, timespan: string, lookbackDays: number): Promise<CandleData[]> {
  if (!POLYGON_API_KEY) throw new Error('Polygon API key not configured')

  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - lookbackDays)

  const fromStr = from.toISOString().split('T')[0]
  const toStr = to.toISOString().split('T')[0]

  const url = `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${POLYGON_API_KEY}` },
    next: { revalidate: 300 },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Polygon error ${resp.status}: ${text}`)
  }

  const data = await resp.json()

  if (!data.results || data.results.length === 0) {
    throw new Error(`No data returned for ${ticker}`)
  }

  return data.results.map((r: any) => ({
    timestamp: r.t,
    open:      r.o,
    high:      r.h,
    low:       r.l,
    close:     r.c,
    volume:    r.v,
  }))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawSymbol = (searchParams.get('symbol') || 'SPX').toUpperCase().trim()
    const timeframe = (searchParams.get('timeframe') || '1d').toLowerCase()

    const tfConfig = TIMEFRAME_CONFIG[timeframe]
    if (!tfConfig) {
      return NextResponse.json({ error: 'Invalid timeframe. Use: 1d, 4h, 1h' }, { status: 400 })
    }

    const polygonTicker = SYMBOL_MAP[rawSymbol] || rawSymbol

    let candles: CandleData[]
    let usedTicker = polygonTicker

    try {
      candles = await fetchCandles(polygonTicker, tfConfig.multiplier, tfConfig.timespan, tfConfig.lookbackDays)
    } catch (primaryError) {
      // Fallback: try ETF equivalents for indices
      const fallbacks: Record<string, string> = {
        'I:SPX': 'SPY',
        'I:NDX': 'QQQ',
        'I:DJI': 'DIA',
      }
      const fallbackTicker = fallbacks[polygonTicker]
      if (fallbackTicker) {
        candles = await fetchCandles(fallbackTicker, tfConfig.multiplier, tfConfig.timespan, tfConfig.lookbackDays)
        usedTicker = fallbackTicker
      } else {
        throw primaryError
      }
    }

    const result = analyzeMarket(candles, rawSymbol, timeframe)

    return NextResponse.json({
      ...result,
      polygonTicker: usedTicker,
    })
  } catch (error: any) {
    console.error('[neural-analysis] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    )
  }
}
