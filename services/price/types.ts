export interface PriceData {
  symbol: string
  price: number
  timestamp: Date
  marketStatus?: 'open' | 'closed' | 'pre-market' | 'after-hours'
  isDelayed?: boolean
}

export interface PriceProvider {
  getName(): string
  getPrice(symbol: string): Promise<PriceData>
  getPrices(symbols: string[]): Promise<PriceData[]>
  isSymbolSupported(symbol: string): boolean
}

export interface PriceSnapshot {
  id: string
  symbol: string
  price: number
  timestamp: string
  created_at: string
}

export interface ValidationEvent {
  id: string
  analysis_id: string
  event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
  target_number: number | null
  price_at_hit: number
  hit_at: string
  created_at: string
}

export type AnalysisStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
