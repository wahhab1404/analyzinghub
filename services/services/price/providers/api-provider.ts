import { PriceProvider, PriceData } from '../types'

export class ApiPriceProvider implements PriceProvider {
  private apiUrl: string
  private apiKey: string | null

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl = apiUrl || process.env.PRICE_API_URL || ''
    this.apiKey = apiKey || process.env.PRICE_API_KEY || null
  }

  getName(): string {
    return 'API Provider'
  }

  async getPrice(symbol: string): Promise<PriceData> {
    if (!this.apiUrl) {
      throw new Error('API URL not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(`${this.apiUrl}/price/${encodeURIComponent(symbol)}`, {
      headers,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch price for ${symbol}: ${response.statusText}`)
    }

    const data = await response.json()

    return {
      symbol,
      price: data.price,
      timestamp: new Date(data.timestamp || Date.now()),
    }
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    if (!this.apiUrl) {
      throw new Error('API URL not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(`${this.apiUrl}/prices`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ symbols }),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch prices: ${response.statusText}`)
    }

    const data = await response.json()

    return data.prices.map((item: any) => ({
      symbol: item.symbol,
      price: item.price,
      timestamp: new Date(item.timestamp || Date.now()),
    }))
  }

  isSymbolSupported(symbol: string): boolean {
    return true
  }
}
