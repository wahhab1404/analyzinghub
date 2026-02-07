import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface PolygonTicker {
  ticker: string
  name: string
  market: string
  locale: string
  primary_exchange?: string
  type?: string
  active: boolean
  currency_name?: string
  base_currency_symbol?: string
}

interface PolygonSearchResponse {
  results?: PolygonTicker[]
  status: string
  count: number
}

const POPULAR_INDEX_SYMBOLS = [
  { symbol: 'SPX', name: 'S&P 500 Index', type: 'Index', exchange: 'INDEX' },
  { symbol: 'NDX', name: 'NASDAQ 100 Index', type: 'Index', exchange: 'INDEX' },
  { symbol: 'DJI', name: 'Dow Jones Industrial Average', type: 'Index', exchange: 'INDEX' },
  { symbol: 'RUT', name: 'Russell 2000 Index', type: 'Index', exchange: 'INDEX' },
  { symbol: 'VIX', name: 'CBOE Volatility Index', type: 'Index', exchange: 'INDEX' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'Index ETF', exchange: 'NYSE' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'Index ETF', exchange: 'NASDAQ' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'Index ETF', exchange: 'NYSE' },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'Index ETF', exchange: 'NYSE' },
]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ results: POPULAR_INDEX_SYMBOLS })
    }

    const apiKey = process.env.POLYGON_API_KEY

    if (!apiKey) {
      console.error('Polygon API key not configured, using fallback symbols')
      const searchQuery = query.trim().toUpperCase()
      const filtered = POPULAR_INDEX_SYMBOLS.filter(s =>
        s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
      )
      return NextResponse.json({ results: filtered.length > 0 ? filtered : POPULAR_INDEX_SYMBOLS })
    }

    const searchQuery = query.trim().toUpperCase()

    const tickerUrl = `https://api.polygon.io/v3/reference/tickers?ticker.gte=${encodeURIComponent(searchQuery)}&active=true&order=asc&limit=100&sort=ticker&apiKey=${apiKey}`
    const searchUrl = `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(searchQuery)}&active=true&limit=50&apiKey=${apiKey}`

    const [tickerResponse, searchResponse] = await Promise.all([
      fetch(tickerUrl, { headers: { 'Accept': 'application/json' } }),
      fetch(searchUrl, { headers: { 'Accept': 'application/json' } })
    ])

    let allResults: PolygonTicker[] = []

    if (tickerResponse.ok) {
      const tickerData: PolygonSearchResponse = await tickerResponse.json()
      if (tickerData.results) {
        allResults = tickerData.results.filter(t =>
          t.ticker.startsWith(searchQuery)
        )
      }
    }

    if (searchResponse.ok) {
      const searchData: PolygonSearchResponse = await searchResponse.json()
      if (searchData.results) {
        const existingTickers = new Set(allResults.map(r => r.ticker))
        searchData.results.forEach(result => {
          if (!existingTickers.has(result.ticker)) {
            allResults.push(result)
          }
        })
      }
    }

    const formattedResults = allResults
      .filter(ticker => {
        if (!ticker.active) return false

        const type = ticker.type?.toUpperCase() || ''
        const name = ticker.name?.toUpperCase() || ''
        const symbol = ticker.ticker?.toUpperCase() || ''

        const isIndex = type === 'INDEX' ||
                       name.includes('INDEX') ||
                       name.includes('S&P') ||
                       name.includes('NASDAQ') ||
                       name.includes('DOW JONES') ||
                       name.includes('RUSSELL') ||
                       ['SPX', 'NDX', 'DJI', 'RUT', 'VIX'].includes(symbol)

        const isIndexETF = type === 'ETF' && (
          name.includes('S&P 500') ||
          name.includes('NASDAQ 100') ||
          name.includes('DOW JONES') ||
          name.includes('RUSSELL 2000') ||
          ['SPY', 'QQQ', 'IWM', 'DIA'].includes(symbol)
        )

        return isIndex || isIndexETF
      })
      .slice(0, 30)
      .map(ticker => {
        let displayType = 'Index'

        if (ticker.type === 'ETF') {
          displayType = 'Index ETF'
        }

        return {
          symbol: ticker.ticker,
          name: ticker.name,
          type: displayType,
          exchange: ticker.primary_exchange || ticker.market
        }
      })

    if (formattedResults.length === 0) {
      const filtered = POPULAR_INDEX_SYMBOLS.filter(s =>
        s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
      )
      return NextResponse.json({ results: filtered.length > 0 ? filtered : POPULAR_INDEX_SYMBOLS })
    }

    return NextResponse.json({ results: formattedResults })
  } catch (error: any) {
    console.error('Search indices error:', error)
    const query = new URL(request.url).searchParams.get('q') || ''
    const searchQuery = query.trim().toUpperCase()
    const filtered = POPULAR_INDEX_SYMBOLS.filter(s =>
      s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
    )
    return NextResponse.json({ results: filtered.length > 0 ? filtered : POPULAR_INDEX_SYMBOLS })
  }
}
