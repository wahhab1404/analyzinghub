import { PriceProvider, PriceData } from '../types'

export class PolygonPriceProvider implements PriceProvider {
  private apiKey: string
  private baseUrl = 'https://api.polygon.io'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.POLYGON_API_KEY || ''
    if (!this.apiKey) {
      throw new Error('Polygon API key is required')
    }
  }

  getName(): string {
    return 'Polygon.io'
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const normalizedSymbol = this.normalizeSymbol(symbol)

    try {
      const snapshotUrl = normalizedSymbol.startsWith('X:')
        ? `${this.baseUrl}/v2/snapshot/locale/global/markets/crypto/tickers/${normalizedSymbol}?apiKey=${this.apiKey}`
        : `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${normalizedSymbol}?apiKey=${this.apiKey}`

      const response = await fetch(snapshotUrl, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return this.getFallbackPrice(symbol, normalizedSymbol)
        }
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status === 'ERROR' || !data.ticker) {
        return this.getFallbackPrice(symbol, normalizedSymbol)
      }

      const ticker = data.ticker
      let price: number
      let priceTimestamp: Date

      if (ticker.day?.c) {
        price = ticker.day.c
        priceTimestamp = new Date()
      } else if (ticker.lastTrade?.p) {
        price = ticker.lastTrade.p
        priceTimestamp = new Date(ticker.lastTrade.t / 1000000)
      } else if (ticker.prevDay?.c) {
        price = ticker.prevDay.c
        priceTimestamp = new Date()
      } else {
        return this.getFallbackPrice(symbol, normalizedSymbol)
      }

      const marketStatus = this.determineMarketStatus(priceTimestamp)

      return {
        symbol,
        price,
        timestamp: priceTimestamp,
        marketStatus,
        isDelayed: marketStatus !== 'open',
      }
    } catch (error: any) {
      console.error(`Error fetching price for ${symbol}:`, error.message)
      return this.getFallbackPrice(symbol, normalizedSymbol)
    }
  }

  private async getFallbackPrice(symbol: string, normalizedSymbol: string): Promise<PriceData> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v2/last/trade/${normalizedSymbol}?apiKey=${this.apiKey}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        if (data.results?.p) {
          const priceTimestamp = new Date(data.results.t / 1000000)
          return {
            symbol,
            price: data.results.p,
            timestamp: priceTimestamp,
            marketStatus: this.determineMarketStatus(priceTimestamp),
            isDelayed: true,
          }
        }
      }
    } catch (error) {
      console.error(`Fallback price fetch failed for ${symbol}`)
    }

    throw new Error(`No price data available for ${symbol}`)
  }

  private determineMarketStatus(priceTimestamp: Date): 'open' | 'closed' | 'pre-market' | 'after-hours' {
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

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    const results = await Promise.allSettled(
      symbols.map(symbol => this.getPrice(symbol))
    )

    const prices: PriceData[] = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        prices.push(result.value)
      } else {
        console.error(`Failed to fetch price for ${symbols[index]}:`, result.reason)
      }
    })

    return prices
  }

  isSymbolSupported(symbol: string): boolean {
    return true
  }

  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase().trim()

    if (upper.includes('/')) {
      const parts = upper.split('/')
      if (parts[1] === 'USD') {
        return `X:${parts[0]}USD`
      }
    }

    return upper
  }
}
