import { PriceProvider, PriceData } from '../types'

export class MockPriceProvider implements PriceProvider {
  private basePrices: Map<string, number> = new Map([
    ['BTC/USD', 45000],
    ['ETH/USD', 2500],
    ['AAPL', 175],
    ['GOOGL', 140],
    ['MSFT', 380],
    ['TSLA', 250],
    ['AMZN', 155],
  ])

  private priceHistory: Map<string, number[]> = new Map()

  getName(): string {
    return 'Mock Provider'
  }

  async getPrice(symbol: string): Promise<PriceData> {
    await this.simulateDelay()

    const basePrice = this.basePrices.get(symbol) || 100
    const history = this.priceHistory.get(symbol) || []

    const volatility = 0.02
    const lastPrice = history.length > 0 ? history[history.length - 1] : basePrice
    const change = (Math.random() - 0.5) * 2 * volatility
    const newPrice = lastPrice * (1 + change)

    history.push(newPrice)
    if (history.length > 100) {
      history.shift()
    }
    this.priceHistory.set(symbol, history)

    const timestamp = new Date()
    const marketStatus = this.determineMarketStatus(timestamp)

    return {
      symbol,
      price: Math.round(newPrice * 100) / 100,
      timestamp,
      marketStatus,
      isDelayed: marketStatus !== 'open',
    }
  }

  private determineMarketStatus(timestamp: Date): 'open' | 'closed' | 'pre-market' | 'after-hours' {
    const etTime = new Date(timestamp.toLocaleString('en-US', { timeZone: 'America/New_York' }))
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
    return Promise.all(symbols.map(symbol => this.getPrice(symbol)))
  }

  isSymbolSupported(symbol: string): boolean {
    return this.basePrices.has(symbol)
  }

  private simulateDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100))
  }

  addSymbol(symbol: string, basePrice: number): void {
    this.basePrices.set(symbol, basePrice)
  }
}
