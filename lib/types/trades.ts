// ─────────────────────────────────────────────────────────────────────────────
// Trades Module — TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export type TradeType = 'stock' | 'option'
export type TradeDirection = 'long' | 'short' | 'call' | 'put'
export type TradeStatus = 'draft' | 'published' | 'active' | 'stopped' | 'completed' | 'cancelled' | 'expired'
export type OptionType = 'call' | 'put'
export type StopStatus = 'active' | 'hit' | 'adjusted' | 'cancelled'
export type ExpirationStatus = 'active' | 'expired' | 'closed'
export type TradeVisibility = 'public' | 'followers' | 'subscribers' | 'plan_only' | 'private'
export type TradeAlertType = 'published' | 'target_hit' | 'new_high' | 'stop_hit' | 'completed' | 'expired' | 'update'
export type TradeAlertStatus = 'sent' | 'failed' | 'pending'
export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high'

// ─────────────────────────────────────────────────────────────────────────────
// Target
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeTarget {
  label: string        // 'TP1', 'TP2', 'TP3', 'TP4', 'TP5'
  price: number
  hit: boolean
  hit_at?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Trade
// ─────────────────────────────────────────────────────────────────────────────

export interface Trade {
  id: string
  user_id: string
  analysis_id: string | null
  symbol: string
  trade_type: TradeType
  direction: TradeDirection
  status: TradeStatus

  // Price tracking
  entry_price: number | null
  current_price: number | null
  highest_price_since_entry: number | null
  lowest_price_since_entry: number | null

  // Stop loss
  stop_loss: number | null
  stop_status: StopStatus

  // Targets
  targets: TradeTarget[]
  hit_targets: Array<{ index: number; price: number; hit_at: string }>

  // Metadata
  timeframe: string | null
  expected_duration: string | null
  risk_level: RiskLevel | null
  notes: string | null

  // Visibility
  visibility: TradeVisibility
  plan_id: string | null
  telegram_channel_id: string | null
  is_public: boolean
  is_testing: boolean

  // Timestamps
  published_at: string | null
  activated_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Option Trade Details
// ─────────────────────────────────────────────────────────────────────────────

export interface OptionTradeDetails {
  id: string
  trade_id: string
  underlying_symbol: string
  option_type: OptionType
  strike_price: number
  expiration_date: string     // ISO date string
  contract_symbol: string | null

  entry_premium: number
  current_premium: number | null
  highest_premium_since_entry: number | null
  lowest_premium_since_entry: number | null
  stop_premium: number | null
  stop_rule: string | null

  quantity: number
  contract_multiplier: number
  entry_cost_total: number    // generated

  win_threshold_met_at: string | null
  max_profit_value: number | null
  expiration_status: ExpirationStatus

  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade Alert (Telegram deduplication log)
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeAlert {
  id: string
  trade_id: string
  alert_type: TradeAlertType
  target_index: number | null
  price: number | null
  sent_to_channel_id: string | null
  telegram_message_id: string | null
  status: TradeAlertStatus
  created_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Rich trade (with joined relations)
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeFull extends Trade {
  author?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  analysis?: {
    id: string
    title: string | null
    symbol?: string
    direction?: string | null
  } | null
  option_details?: OptionTradeDetails | null
  plan?: {
    id: string
    name: string
  } | null
  alerts?: TradeAlert[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Forms / Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateStockTradeInput {
  trade_type: 'stock'
  symbol: string
  direction: 'long' | 'short'
  entry_price: number
  stop_loss: number
  targets: Array<{ label: string; price: number }>
  timeframe?: string
  expected_duration?: string
  risk_level?: RiskLevel
  notes?: string
  analysis_id?: string | null
  visibility?: TradeVisibility
  plan_id?: string | null
  telegram_channel_id?: string | null
  is_public?: boolean
  is_testing?: boolean
  publish_now?: boolean
}

export interface CreateOptionTradeInput {
  trade_type: 'option'
  symbol: string
  direction: 'call' | 'put'
  entry_price?: number | null   // optional — use entry_premium
  stop_loss?: number | null
  targets?: Array<{ label: string; price: number }>
  timeframe?: string
  expected_duration?: string
  risk_level?: RiskLevel
  notes?: string
  analysis_id?: string | null
  visibility?: TradeVisibility
  plan_id?: string | null
  telegram_channel_id?: string | null
  is_public?: boolean
  is_testing?: boolean
  publish_now?: boolean

  // Option-specific
  underlying_symbol: string
  option_type: OptionType
  strike_price: number
  expiration_date: string
  contract_symbol?: string
  entry_premium: number
  stop_premium?: number
  stop_rule?: string
  quantity?: number
  contract_multiplier?: number
}

export type CreateTradeInput = CreateStockTradeInput | CreateOptionTradeInput

export interface UpdateTradeInput {
  status?: TradeStatus
  current_price?: number
  highest_price_since_entry?: number
  stop_loss?: number
  targets?: TradeTarget[]
  notes?: string
  telegram_channel_id?: string
  plan_id?: string | null
  visibility?: TradeVisibility
  is_public?: boolean
  send_telegram_update?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed / filter types
// ─────────────────────────────────────────────────────────────────────────────

export interface TradeFilters {
  symbol?: string
  trade_type?: TradeType | ''
  direction?: TradeDirection | ''
  status?: TradeStatus | ''
  user_id?: string
  plan_id?: string
  linked?: 'linked' | 'standalone' | ''
  is_testing?: boolean
}

export type TradeSortBy = 'newest' | 'oldest' | 'active' | 'completed' | 'stopped'

// ─────────────────────────────────────────────────────────────────────────────
// P/L helper
// ─────────────────────────────────────────────────────────────────────────────

export interface TradePnL {
  unrealized_pnl: number | null
  unrealized_pct: number | null
  highest_pnl: number | null
  highest_pct: number | null
  is_winning: boolean
}

export function calcStockPnL(trade: Trade): TradePnL {
  if (trade.entry_price == null) return { unrealized_pnl: null, unrealized_pct: null, highest_pnl: null, highest_pct: null, is_winning: false }
  const entry = trade.entry_price

  let current = trade.current_price != null ? (trade.direction === 'long' ? trade.current_price - entry : entry - trade.current_price) : null
  let currentPct = current != null ? (current / entry) * 100 : null

  const high = trade.highest_price_since_entry
  let highPnl = high != null ? (trade.direction === 'long' ? high - entry : entry - high) : null
  let highPct = highPnl != null ? (highPnl / entry) * 100 : null

  return {
    unrealized_pnl: current != null ? +current.toFixed(4) : null,
    unrealized_pct: currentPct != null ? +currentPct.toFixed(2) : null,
    highest_pnl: highPnl != null ? +highPnl.toFixed(4) : null,
    highest_pct: highPct != null ? +highPct.toFixed(2) : null,
    is_winning: (current ?? 0) > 0,
  }
}

export function calcOptionPnL(details: OptionTradeDetails): TradePnL {
  const entry = details.entry_premium
  const qty = details.quantity ?? 1
  const mult = details.contract_multiplier ?? 100

  const current = details.current_premium != null
    ? (details.current_premium - entry) * qty * mult
    : null
  const currentPct = current != null ? ((details.current_premium! - entry) / entry) * 100 : null

  const highPnl = details.highest_premium_since_entry != null
    ? (details.highest_premium_since_entry - entry) * qty * mult
    : null
  const highPct = details.highest_premium_since_entry != null
    ? ((details.highest_premium_since_entry - entry) / entry) * 100
    : null

  return {
    unrealized_pnl: current != null ? +current.toFixed(2) : null,
    unrealized_pct: currentPct != null ? +currentPct.toFixed(2) : null,
    highest_pnl: highPnl != null ? +highPnl.toFixed(2) : null,
    highest_pct: highPct != null ? +highPct.toFixed(2) : null,
    is_winning: (highPnl ?? 0) >= 100,
  }
}
