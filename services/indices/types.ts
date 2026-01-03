/**
 * TypeScript types for Indices Hub
 */

export type IndexSymbol = 'SPX' | 'NDX' | 'DJI';

export type AnalysisVisibility = 'public' | 'subscribers' | 'admin_only';
export type AnalysisStatus = 'draft' | 'published' | 'archived';

export type TradeStatus = 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled';
export type InstrumentType = 'options' | 'futures';
export type TradeDirection = 'call' | 'put' | 'long' | 'short';
export type OptionType = 'call' | 'put';

export interface IndicesReference {
  index_symbol: IndexSymbol;
  polygon_index_ticker: string;
  display_name: string;
  description: string | null;
  market: string;
  created_at: string;
  updated_at: string;
}

export interface IndexAnalysis {
  id: string;
  index_symbol: IndexSymbol;
  author_id: string;
  title: string;
  body: string;
  chart_image_url: string | null;
  chart_embed_url: string | null;
  visibility: AnalysisVisibility;
  status: AnalysisStatus;
  views_count: number;
  likes_count: number;
  created_at: string;
  published_at: string | null;
  updated_at: string;
}

export interface IndexAnalysisWithAuthor extends IndexAnalysis {
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    email: string;
  };
  trades_count?: number;
  active_trades_count?: number;
}

export interface UnderlyingSnapshot {
  price: number;
  timestamp: string;
  session_high?: number;
  session_low?: number;
  session_open?: number;
  previous_close?: number;
}

export interface ContractSnapshot {
  bid?: number;
  ask?: number;
  mid: number;
  last?: number;
  timestamp: string;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface TradeTarget {
  level: number;
  description: string;
  hit_at?: string;
}

export interface TradeStoploss {
  level: number;
  description: string;
  hit_at?: string;
}

export interface IndexTrade {
  id: string;
  analysis_id: string;
  author_id: string;
  status: TradeStatus;
  instrument_type: InstrumentType;
  direction: TradeDirection;
  underlying_index_symbol: IndexSymbol;
  polygon_underlying_index_ticker: string;
  polygon_option_ticker: string | null;
  strike: number | null;
  expiry: string | null;
  option_type: OptionType | null;
  contract_multiplier: number;
  entry_underlying_snapshot: UnderlyingSnapshot;
  entry_contract_snapshot: ContractSnapshot;
  current_underlying: number | null;
  current_contract: number | null;
  underlying_high_since: number | null;
  underlying_low_since: number | null;
  contract_high_since: number | null;
  contract_low_since: number | null;
  targets: TradeTarget[];
  stoploss: TradeStoploss | null;
  notes: string | null;
  last_quote_at: string | null;
  created_at: string;
  published_at: string | null;
  closed_at: string | null;
  updated_at: string;
}

export interface IndexTradeWithAuthor extends IndexTrade {
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface AnalysisUpdate {
  id: string;
  analysis_id: string;
  author_id: string;
  body: string;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisUpdateWithAuthor extends AnalysisUpdate {
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface TradeUpdate {
  id: string;
  trade_id: string;
  author_id: string;
  body: string;
  attachment_url: string | null;
  changes: Record<string, { old: any; new: any }>;
  created_at: string;
  updated_at: string;
}

export interface TradeUpdateWithAuthor extends TradeUpdate {
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

// API Request/Response types

export interface CreateAnalysisRequest {
  index_symbol: IndexSymbol;
  title: string;
  body: string;
  chart_image_url?: string;
  chart_embed_url?: string;
  visibility: AnalysisVisibility;
  status: AnalysisStatus;
}

export interface UpdateAnalysisRequest {
  title?: string;
  body?: string;
  chart_image_url?: string;
  chart_embed_url?: string;
  visibility?: AnalysisVisibility;
  status?: AnalysisStatus;
}

export interface CreateTradeRequest {
  analysis_id: string;
  instrument_type: InstrumentType;
  direction: TradeDirection;
  underlying_index_symbol: IndexSymbol;
  polygon_option_ticker?: string; // Required for options
  strike?: number; // Required for options
  expiry?: string; // Required for options
  option_type?: OptionType; // Required for options
  targets?: TradeTarget[];
  stoploss?: TradeStoploss;
  notes?: string;
}

export interface UpdateTradeRequest {
  status?: TradeStatus;
  targets?: TradeTarget[];
  stoploss?: TradeStoploss;
  notes?: string;
}

export interface CreateAnalysisUpdateRequest {
  body: string;
  attachment_url?: string;
}

export interface CreateTradeUpdateRequest {
  body: string;
  attachment_url?: string;
  changes?: Record<string, { old: any; new: any }>;
}

// Realtime update types (for SSE streaming)

export interface LiveTradeMetrics {
  trade_id: string;
  underlying: {
    current: number;
    high: number;
    low: number;
  };
  contract: {
    current: number;
    high: number;
    low: number;
  };
  timestamp: string;
}

export interface RealtimeSnapshot {
  trades: LiveTradeMetrics[];
}

export interface RealtimeUpdate extends LiveTradeMetrics {}
