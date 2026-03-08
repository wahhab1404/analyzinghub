import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface Candle {
  t: number   // timestamp ms
  o: number   // open
  h: number   // high
  l: number   // low
  c: number   // close
  v: number   // volume
}

// Simple in-memory cache: key → {data, expiresAt}
const cache = new Map<string, { data: Candle[]; expiresAt: number }>()

function getCache(key: string) {
  const hit = cache.get(key)
  if (!hit || Date.now() > hit.expiresAt) { cache.delete(key); return null }
  return hit.data
}
function setCache(key: string, data: Candle[], ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// Timeframe config → Polygon multiplier + timespan + lookback days + cache TTL
// 1D: 15-min bars → ~26 bars per full session; look back 7 days to cover weekends/holidays
const TF_CONFIG = {
  '1D': { multiplier: 15, timespan: 'minute', daysBack: 7,   ttl: 60_000  },
  '1W': { multiplier: 1,  timespan: 'hour',   daysBack: 7,   ttl: 300_000 },
  '1M': { multiplier: 1,  timespan: 'day',    daysBack: 30,  ttl: 600_000 },
  '3M': { multiplier: 1,  timespan: 'day',    daysBack: 90,  ttl: 600_000 },
  '1Y': { multiplier: 1,  timespan: 'week',   daysBack: 365, ttl: 600_000 },
} as const

type TF = keyof typeof TF_CONFIG

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params  = await context.params
    const symbol  = params.symbol.toUpperCase()
    const tf      = (request.nextUrl.searchParams.get('tf') || '1D') as TF
    const config  = TF_CONFIG[tf] ?? TF_CONFIG['1D']
    const apiKey  = process.env.POLYGON_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 })
    }

    const cacheKey = `candles:${symbol}:${tf}`
    const cached = getCache(cacheKey)
    if (cached) {
      return NextResponse.json({ candles: cached, cached: true })
    }

    const now  = new Date()
    const from = new Date(now)
    from.setDate(now.getDate() - config.daysBack)

    const fromStr = toDateStr(from)
    const toStr   = toDateStr(now)

    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${config.multiplier}/${config.timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=500&apiKey=${encodeURIComponent(apiKey)}`

    const res  = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
    const text = await res.text()

    let data: any
    try { data = JSON.parse(text) } catch {
      console.error('Polygon candles parse error:', text.slice(0, 200))
      return NextResponse.json({ error: 'Invalid response from Polygon' }, { status: 502 })
    }

    if (!res.ok || data.status === 'ERROR') {
      console.error('Polygon candles error:', data)
      return NextResponse.json({ error: data.error || 'Polygon API error', candles: [] }, { status: 200 })
    }

    const results: any[] = data.results || []

    // For 1D, show the most recent trading session's bars.
    // A full session at 15-min is ~26 bars. If the latest session has fewer than
    // 10 bars (market just opened, holiday, etc.) fall back to the last 30 bars
    // so we always show a meaningful amount of candles.
    let candles: Candle[]
    if (tf === '1D' && results.length > 0) {
      const latestTs  = results[results.length - 1].t
      const latestDay = new Date(latestTs).toDateString()
      const sessionBars = results.filter(r => new Date(r.t).toDateString() === latestDay)
      candles = (sessionBars.length >= 10 ? sessionBars : results.slice(-30)).map(r => ({
        t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v
      }))
    } else {
      candles = results.map(r => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
    }

    setCache(cacheKey, candles, config.ttl)
    return NextResponse.json({ candles, cached: false })
  } catch (err: any) {
    console.error('Candles route error:', err)
    return NextResponse.json({ error: err.message, candles: [] }, { status: 200 })
  }
}
