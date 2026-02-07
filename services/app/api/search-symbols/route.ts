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

const POPULAR_FALLBACK_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'Stock', exchange: 'NASDAQ' },
  { symbol: 'ORCL', name: 'Oracle Corporation', type: 'Stock', exchange: 'NYSE' },
  { symbol: 'BTC/USD', name: 'Bitcoin', type: 'Crypto', exchange: 'crypto' },
  { symbol: 'ETH/USD', name: 'Ethereum', type: 'Crypto', exchange: 'crypto' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'Stock', exchange: 'NYSE' }
]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ results: POPULAR_FALLBACK_SYMBOLS })
    }

    const apiKey = process.env.POLYGON_API_KEY

    if (!apiKey) {
      console.error('Polygon API key not configured, using fallback symbols')
      const searchQuery = query.trim().toUpperCase()
      const filtered = POPULAR_FALLBACK_SYMBOLS.filter(s =>
        s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
      )
      return NextResponse.json({ results: filtered.length > 0 ? filtered : POPULAR_FALLBACK_SYMBOLS })
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

    if (allResults.length === 0) {
      const filtered = POPULAR_FALLBACK_SYMBOLS.filter(s =>
        s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
      )
      return NextResponse.json({ results: filtered.length > 0 ? filtered : [] })
    }

    const formattedResults = allResults
      .filter(ticker => ticker.active)
      .slice(0, 30)
      .map(ticker => {
        let displaySymbol = ticker.ticker
        let type = 'Stock'

        if (ticker.market === 'crypto') {
          type = 'Crypto'
          if (ticker.base_currency_symbol) {
            displaySymbol = `${ticker.base_currency_symbol}/USD`
          }
        } else if (ticker.market === 'fx') {
          type = 'Forex'
        } else if (ticker.type === 'ETF' || ticker.type === 'ETV') {
          type = 'ETF'
        }

        return {
          symbol: displaySymbol,
          name: ticker.name,
          type: type,
          exchange: ticker.primary_exchange || ticker.market
        }
      })

    return NextResponse.json({ results: formattedResults })
  } catch (error: any) {
    console.error('Search symbols error:', error)
    const query = new URL(request.url).searchParams.get('q') || ''
    const searchQuery = query.trim().toUpperCase()
    const filtered = POPULAR_FALLBACK_SYMBOLS.filter(s =>
      s.symbol.includes(searchQuery) || s.name.toUpperCase().includes(searchQuery)
    )
    return NextResponse.json({ results: filtered.length > 0 ? filtered : POPULAR_FALLBACK_SYMBOLS })
  }
}
