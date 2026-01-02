import { PriceProvider, PriceData, PriceSnapshot } from './types'
import { PolygonPriceProvider } from './providers/polygon-provider'

export class PriceService {
  private provider: PriceProvider

  constructor(provider?: PriceProvider) {
    this.provider = provider || this.getDefaultProvider()
  }

  private getDefaultProvider(): PriceProvider {
    const polygonApiKey = process.env.POLYGON_API_KEY

    if (!polygonApiKey) {
      throw new Error('Price service unavailable: Polygon API key not configured')
    }

    return new PolygonPriceProvider(polygonApiKey)
  }

  async getCurrentPrice(symbol: string): Promise<PriceData> {
    return this.provider.getPrice(symbol)
  }

  async getCurrentPrices(symbols: string[]): Promise<PriceData[]> {
    return this.provider.getPrices(symbols)
  }

  isSymbolSupported(symbol: string): boolean {
    return this.provider.isSymbolSupported(symbol)
  }

  getProviderName(): string {
    return this.provider.getName()
  }

  async savePriceSnapshot(
    supabaseClient: any,
    priceData: PriceData
  ): Promise<PriceSnapshot | null> {
    const { data, error } = await supabaseClient
      .from('price_snapshots')
      .insert({
        symbol: priceData.symbol,
        price: priceData.price,
        timestamp: priceData.timestamp.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving price snapshot:', error)
      return null
    }

    return data
  }

  async getRecentSnapshots(
    supabaseClient: any,
    symbol: string,
    limit: number = 100
  ): Promise<PriceSnapshot[]> {
    const { data, error } = await supabaseClient
      .from('price_snapshots')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching price snapshots:', error)
      return []
    }

    return data || []
  }
}
