import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StockQuote {
  symbol: string
  price: number
  previousClose?: number
  change?: number
  changePercent?: number
  high?: number
  low?: number
  volume?: number
  timestamp: string
  marketStatus?: 'open' | 'closed' | 'pre-market' | 'after-hours'
  isDelayed?: boolean
  cached?: boolean
  provider: string
}

type CacheEntry = { value: StockQuote; expiresAt: number }
const cache = new Map<string, CacheEntry>()

function getCache(key: string): StockQuote | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expiresAt) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function setCache(key: string, value: StockQuote, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function jsonError(status: number, code: string, details?: any) {
  return NextResponse.json(
    { ok: false, error: code, ...(details ? { details } : {}) },
    { status }
  )
}

function normalizeSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim()

  // Convert crypto pairs like BTC/USD to Polygon format
  if (upper.includes('/')) {
    const parts = upper.split('/')
    if (parts[1] === 'USD') {
      return `X:${parts[0]}USD`
    }
  }

  return upper
}

function determineMarketStatus(priceTimestamp: Date): 'open' | 'closed' | 'pre-market' | 'after-hours' {
  const now = new Date()
  const timeDiff = now.getTime() - priceTimestamp.getTime()
  const minutesDiff = timeDiff / (1000 * 60)

  if (minutesDiff > 15) {
    return 'closed'
  }

  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const currentTimeMinutes = hours * 60 + minutes
  const dayOfWeek = etTime.getDay()

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'closed'
  }

  const marketOpen = 9 * 60 + 30
  const marketClose = 16 * 60
  const preMarketStart = 4 * 60
  const afterHoursEnd = 20 * 60

  if (currentTimeMinutes >= marketOpen && currentTimeMinutes < marketClose) {
    return 'open'
  } else if (currentTimeMinutes >= preMarketStart && currentTimeMinutes < marketOpen) {
    return 'pre-market'
  } else if (currentTimeMinutes >= marketClose && currentTimeMinutes < afterHoursEnd) {
    return 'after-hours'
  }

  return 'closed'
}

async function fetchPolygonSnapshot(symbol: string, apiKey: string) {
  const normalizedSymbol = normalizeSymbol(symbol)

  // Use snapshot endpoint for stocks, crypto, or indices
  const isGlobalMarket = normalizedSymbol.startsWith('X:')
  const isIndex = normalizedSymbol.startsWith('I:')

  // For indices, use aggregates endpoint (more reliable across API tiers)
  if (isIndex) {
    const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(normalizedSymbol)}/prev?adjusted=true&apiKey=${encodeURIComponent(apiKey)}`

    const res = await fetch(aggUrl, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    })

    const text = await res.text()
    let data: any = null

    try {
      data = text ? JSON.parse(text) : null
    } catch (e) {
      console.error('Failed to parse Polygon response:', text?.slice(0, 200))
    }

    if (!res.ok || !data?.results || data.results.length === 0) {
      return {
        ok: false as const,
        status: res.status,
        error: 'POLYGON_ERROR',
        details: data ?? text?.slice(0, 500)
      }
    }

    const result = data.results[0]

    return {
      ok: true as const,
      symbol,
      price: result.c,
      timestamp: new Date(result.t).toISOString(),
      marketStatus: 'closed' as const,
      isDelayed: true,
      previousClose: result.c,
      high: result.h,
      low: result.l,
      volume: result.v,
      provider: 'polygon'
    }
  }

  let snapshotUrl: string
  if (isGlobalMarket) {
    snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(normalizedSymbol)}?apiKey=${encodeURIComponent(apiKey)}`
  } else {
    snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(normalizedSymbol)}?apiKey=${encodeURIComponent(apiKey)}`
  }

  const res = await fetch(snapshotUrl, {
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  })

  const text = await res.text()
  let data: any = null

  try {
    data = text ? JSON.parse(text) : null
  } catch (e) {
    console.error('Failed to parse Polygon response:', text?.slice(0, 200))
  }

  if (!res.ok) {
    console.warn('Polygon snapshot error:', res.status, data ?? text?.slice(0, 200))
    return {
      ok: false as const,
      status: res.status,
      error: 'POLYGON_ERROR',
      details: data ?? text?.slice(0, 500)
    }
  }

  const ticker = data?.ticker

  if (!ticker) {
    return {
      ok: false as const,
      status: 502,
      error: 'INVALID_PROVIDER_RESPONSE',
      details: 'No ticker data in response'
    }
  }

  // Extract price from snapshot (try multiple sources in order of preference)
  let price: number | undefined
  let priceTimestamp: Date = new Date()
  let previousClose: number | undefined
  let high: number | undefined
  let low: number | undefined
  let volume: number | undefined

  // Try to get current day data first
  if (ticker.day?.c) {
    price = ticker.day.c
    high = ticker.day.h
    low = ticker.day.l
    volume = ticker.day.v
    priceTimestamp = new Date()
  } else if (ticker.lastTrade?.p) {
    price = ticker.lastTrade.p
    priceTimestamp = new Date(ticker.lastTrade.t / 1000000)
  } else if (ticker.prevDay?.c) {
    price = ticker.prevDay.c
    priceTimestamp = new Date()
  }

  if (typeof price !== 'number') {
    return {
      ok: false as const,
      status: 502,
      error: 'NO_PRICE_DATA',
      details: 'Could not extract price from ticker data'
    }
  }

  // Get previous close for change calculation
  if (ticker.prevDay?.c) {
    previousClose = ticker.prevDay.c
  }

  const marketStatus = determineMarketStatus(priceTimestamp)
  const change = previousClose !== undefined ? price - previousClose : undefined
  const changePercent = previousClose !== undefined && previousClose !== 0
    ? (change! / previousClose) * 100
    : undefined

  return {
    ok: true as const,
    symbol,
    price,
    timestamp: priceTimestamp.toISOString(),
    marketStatus,
    isDelayed: marketStatus !== 'open',
    ...(previousClose !== undefined && { previousClose }),
    ...(change !== undefined && { change }),
    ...(changePercent !== undefined && { changePercent }),
    ...(high !== undefined && { high }),
    ...(low !== undefined && { low }),
    ...(volume !== undefined && { volume }),
    provider: 'polygon'
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbolRaw = searchParams.get('symbol')

    if (!symbolRaw) {
      return jsonError(400, 'SYMBOL_REQUIRED')
    }

    const symbol = symbolRaw.toUpperCase().trim()

    if (!/^[A-Z.\-\/\:]+$/.test(symbol)) {
      return jsonError(400, 'INVALID_SYMBOL_FORMAT')
    }

    const cacheKey = `stock:${symbol}`
    const cached = getCache(cacheKey)

    if (cached) {
      return NextResponse.json({ ...cached, cached: true }, { status: 200 })
    }

    const polygonApiKey = process.env.POLYGON_API_KEY

    if (!polygonApiKey) {
      console.error('[StockPrice] POLYGON_API_KEY missing. Available env vars:', Object.keys(process.env).filter(k => k.includes('POLYGON') || k.includes('API')))
      console.error('[StockPrice] NODE_ENV:', process.env.NODE_ENV)
      return jsonError(500, 'MISSING_POLYGON_API_KEY', {
        hint: 'Configure POLYGON_API_KEY in Netlify Dashboard → Site configuration → Environment variables',
        nodeEnv: process.env.NODE_ENV
      })
    }

    console.log('[StockPrice] Fetching quote for symbol:', symbol)
    const result = await fetchPolygonSnapshot(symbol, polygonApiKey)

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          details: result.details,
          symbol
        },
        { status: result.status }
      )
    }

    const quote: StockQuote = {
      symbol: result.symbol,
      price: result.price,
      timestamp: result.timestamp,
      marketStatus: result.marketStatus,
      isDelayed: result.isDelayed,
      ...(result.previousClose !== undefined && { previousClose: result.previousClose }),
      ...(result.change !== undefined && { change: result.change }),
      ...(result.changePercent !== undefined && { changePercent: result.changePercent }),
      ...(result.high !== undefined && { high: result.high }),
      ...(result.low !== undefined && { low: result.low }),
      ...(result.volume !== undefined && { volume: result.volume }),
      cached: false,
      provider: result.provider
    }

    setCache(cacheKey, quote, 15_000)

    return NextResponse.json(quote, { status: 200 })
  } catch (error: any) {
    console.error('Stock price fatal error:', error)
    return jsonError(500, 'INTERNAL_ERROR', {
      message: error?.message ?? 'Unknown error'
    })
  }
}
