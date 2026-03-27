/**
 * lib/polygon/types.ts
 *
 * Canonical type definitions for all Polygon.io data structures used
 * across the platform (Next.js app, realtime service, edge functions).
 *
 * Keep this file free of business logic — pure types only.
 */

// ── PREMIUM SOURCE STRATEGY ───────────────────────────────────────────────────

/**
 * How the current contract premium was derived.
 * - smart_hybrid: best available live data (mid → last_trade → bid → ask)
 * - mid:          (bid + ask) / 2
 * - last_trade:   most recent executed trade price
 * - bid:          best bid
 * - ask:          best ask
 * - manual:       analyst-overridden price
 * - snapshot:     Polygon REST snapshot fallback (used when streaming stale)
 * - unknown:      no source determined yet
 */
export type PremiumSource =
  | 'smart_hybrid'
  | 'mid'
  | 'last_trade'
  | 'bid'
  | 'ask'
  | 'manual'
  | 'snapshot'
  | 'unknown';

// ── STREAMING FRESHNESS ───────────────────────────────────────────────────────

/**
 * Indicates the health of streaming data for a trade.
 * - fresh:    streaming event received within the last 60 s
 * - degraded: no event for 60–300 s (stream reconnecting)
 * - stale:    no event for >300 s (REST fallback active)
 * - unknown:  streaming has never connected for this trade
 */
export type DataFreshnessStatus = 'fresh' | 'degraded' | 'stale' | 'unknown';

// ── RAW POLYGON WEBSOCKET EVENTS ──────────────────────────────────────────────

/** Polygon Options WebSocket — Quote event (ev: "Q") */
export interface PolygonOptionQuoteEvent {
  ev: 'Q';
  sym: string;    // Option ticker e.g. "O:SPX251219C05900000"
  bx: number;     // Bid exchange
  ax: number;     // Ask exchange
  bp: number;     // Bid price
  ap: number;     // Ask price
  bs: number;     // Bid size
  as: number;     // Ask size
  t: number;      // SIP timestamp (nanoseconds)
  q: number;      // Sequence number
}

/** Polygon Options WebSocket — Trade event (ev: "T") */
export interface PolygonOptionTradeEvent {
  ev: 'T';
  sym: string;    // Option ticker
  p: number;      // Trade price
  s: number;      // Trade size (contracts)
  t: number;      // SIP timestamp (nanoseconds)
  q: number;      // Sequence number
  c?: number[];   // Trade conditions
  x: number;      // Exchange
}

/** Polygon Indices WebSocket — Value event (ev: "V") */
export interface PolygonIndexValueEvent {
  ev: 'V';
  T: string;      // Index ticker e.g. "I:SPX"
  val: number;    // Index value
  t: number;      // Timestamp (ms)
}

/** Polygon WebSocket — Status message */
export interface PolygonStatusEvent {
  ev: 'status';
  status: 'connected' | 'auth_success' | 'auth_failed' | 'success' | 'error';
  message: string;
}

export type PolygonWSEvent =
  | PolygonOptionQuoteEvent
  | PolygonOptionTradeEvent
  | PolygonIndexValueEvent
  | PolygonStatusEvent;

// ── NORMALISED QUOTE ──────────────────────────────────────────────────────────

/**
 * Normalised, source-agnostic quote for a single option contract.
 * Produced by normalizers.ts from raw Polygon events or REST responses.
 */
export interface NormalisedContractQuote {
  /** Polygon option ticker, always with "O:" prefix */
  ticker: string;

  /** Bid price (0 if unavailable) */
  bid: number;

  /** Ask price (0 if unavailable) */
  ask: number;

  /** Mid = (bid + ask) / 2. Null when both sides not available. */
  mid: number | null;

  /** Most recent executed trade price (0 if unavailable) */
  lastTrade: number;

  /** Volume traded today */
  volume: number;

  /** Smart-hybrid price — the recommended single "current premium" value */
  smartPrice: number | null;

  /** How smartPrice was determined */
  premiumSource: PremiumSource;

  /** UTC timestamp of the event */
  eventAt: Date;

  /** True when the quote data is considered valid for trading decisions */
  isValid: boolean;

  /** Reason why isValid is false, if applicable */
  invalidReason?: string;
}

// ── NORMALISED INDEX QUOTE ────────────────────────────────────────────────────

export interface NormalisedIndexQuote {
  ticker: string;    // e.g. "I:SPX"
  value: number;
  eventAt: Date;
}

// ── REST SNAPSHOT RESPONSE ────────────────────────────────────────────────────

/** Polygon REST /v3/snapshot/options/{underlying}/{option_ticker} result */
export interface PolygonOptionSnapshot {
  ticker: string;
  details?: {
    contract_type?: 'call' | 'put';
    expiration_date?: string;
    strike_price?: number;
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  last_quote?: {
    bid?: number;
    ask?: number;
    last_price?: number;
    timeframe?: string;
  };
  day?: {
    volume?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    vwap?: number;
  };
  implied_volatility?: number;
}

// ── STREAMING ENGINE STATE ────────────────────────────────────────────────────

export interface StreamEngineHealth {
  /** Whether the options WebSocket is currently connected and authenticated */
  optionsWsConnected: boolean;

  /** Whether the indices WebSocket is currently connected and authenticated */
  indicesWsConnected: boolean;

  /** Number of option tickers currently subscribed */
  subscribedOptionCount: number;

  /** Number of index tickers currently subscribed */
  subscribedIndexCount: number;

  /** When the last options WebSocket event was received (null = never) */
  lastOptionsEventAt: Date | null;

  /** When the last indices WebSocket event was received (null = never) */
  lastIndexEventAt: Date | null;

  /** Total reconnect attempts since service start */
  reconnectAttempts: number;

  /** 'healthy' | 'degraded' | 'disconnected' */
  status: 'healthy' | 'degraded' | 'disconnected';
}

// ── ACTIVE TRADE TRACKING STATE ───────────────────────────────────────────────

/**
 * In-memory state held by the streaming service for each active trade.
 * This is the per-trade view that gets persisted to Supabase.
 */
export interface TradeStreamState {
  tradeId: string;
  optionTicker: string;
  entryPrice: number;

  currentPremium: number | null;
  highestPremium: number | null;
  lowestPremium: number | null;

  highestPremiumAt: Date | null;
  lowestPremiumAt: Date | null;

  mfe: number | null;  // dollars
  mae: number | null;  // dollars

  premiumSource: PremiumSource;
  lastEventAt: Date | null;
  freshness: DataFreshnessStatus;
}
