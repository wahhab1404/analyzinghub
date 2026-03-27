/**
 * realtime-pricing-service/src/premium-calculator.ts
 *
 * Smart-hybrid premium calculator for the streaming service.
 * Mirrors the logic in lib/polygon/normalizers.ts but adapted for the
 * Node.js realtime service context (no Next.js imports).
 *
 * PREMIUM SOURCE PREFERENCE ORDER (smart_hybrid mode):
 *   1. Mid price — when bid and ask are both valid and spread is reasonable
 *   2. Last trade — when available
 *   3. Bid price — when only bid is available
 *   4. Ask × discount — last resort approximation
 *   5. null — reject the tick entirely (caller should skip this update)
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

export interface PriceInput {
  bid?: number | null;
  ask?: number | null;
  lastTrade?: number | null;
}

export interface PriceResult {
  price: number | null;
  source: PremiumSource;
  mid: number | null;
  bid: number;
  ask: number;
  lastTrade: number;
  isValid: boolean;
  invalidReason?: string;
}

// ── CONFIG ────────────────────────────────────────────────────────────────────

/** If spread / mid > this, we consider mid unreliable and fall back to last trade */
const MAX_SPREAD_FRACTION = 0.50;

/** Discount applied to ask when it's the only price available */
const ASK_DISCOUNT = 0.95;

/** Minimum price (below this we treat the value as invalid) */
const MIN_PRICE = 0.01;

/** Maximum sane option premium — purely a sanity guard for bad feed data */
const MAX_PRICE = 10_000;

// ── HELPERS ───────────────────────────────────────────────────────────────────

function isValid(v: number | null | undefined): v is number {
  return typeof v === 'number' && isFinite(v) && v >= MIN_PRICE && v <= MAX_PRICE;
}

function round4(n: number): number {
  return parseFloat(n.toFixed(4));
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

/**
 * Compute the best available premium from a set of raw price inputs.
 *
 * @param input  Raw bid, ask, lastTrade values from a Polygon event
 * @returns      PriceResult with computed price and diagnostic metadata
 */
export function computeSmartHybridPrice(input: PriceInput): PriceResult {
  const bid = isValid(input.bid) ? input.bid! : 0;
  const ask = isValid(input.ask) ? input.ask! : 0;
  const lastTrade = isValid(input.lastTrade) ? input.lastTrade! : 0;

  // ── Guard: crossed market ────────────────────────────────────────────────
  if (bid > 0 && ask > 0 && bid > ask) {
    // Crossed bid/ask — likely feed artefact. Use last trade if possible.
    if (lastTrade > 0) {
      return {
        price: round4(lastTrade),
        source: 'last_trade',
        mid: null,
        bid: 0,   // discard crossed prices
        ask: 0,
        lastTrade,
        isValid: true,
      };
    }
    return {
      price: null,
      source: 'unknown',
      mid: null,
      bid: 0,
      ask: 0,
      lastTrade: 0,
      isValid: false,
      invalidReason: 'crossed_market_no_last_trade',
    };
  }

  // ── 1. Mid price (preferred) ──────────────────────────────────────────────
  if (bid > 0 && ask > 0) {
    const mid = round4((bid + ask) / 2);
    const spread = ask - bid;
    const spreadFraction = spread / mid;

    if (spreadFraction <= MAX_SPREAD_FRACTION) {
      return {
        price: mid,
        source: 'mid',
        mid,
        bid,
        ask,
        lastTrade,
        isValid: true,
      };
    }
    // Wide spread — log and fall through to last_trade
  }

  // ── 2. Last trade ─────────────────────────────────────────────────────────
  if (lastTrade > 0) {
    const mid = bid > 0 && ask > 0 ? round4((bid + ask) / 2) : null;
    return {
      price: round4(lastTrade),
      source: 'last_trade',
      mid,
      bid,
      ask,
      lastTrade,
      isValid: true,
    };
  }

  // ── 3. Bid only ───────────────────────────────────────────────────────────
  if (bid > 0) {
    return {
      price: round4(bid),
      source: 'bid',
      mid: null,
      bid,
      ask: 0,
      lastTrade: 0,
      isValid: true,
    };
  }

  // ── 4. Ask × discount ─────────────────────────────────────────────────────
  if (ask > 0) {
    return {
      price: round4(ask * ASK_DISCOUNT),
      source: 'ask',
      mid: null,
      bid: 0,
      ask,
      lastTrade: 0,
      isValid: true,
    };
  }

  // ── 5. No valid price ─────────────────────────────────────────────────────
  return {
    price: null,
    source: 'unknown',
    mid: null,
    bid: 0,
    ask: 0,
    lastTrade: 0,
    isValid: false,
    invalidReason: 'no_valid_price_data',
  };
}

/**
 * Merge a quote event and an optional simultaneous trade event to get the
 * best possible price estimate.
 *
 * This is called when both a Q and a T event arrive for the same symbol
 * in the same WebSocket message batch.
 */
export function computeMergedPrice(
  quoteBid: number | null,
  quoteAsk: number | null,
  tradeLast: number | null
): PriceResult {
  return computeSmartHybridPrice({
    bid: quoteBid,
    ask: quoteAsk,
    lastTrade: tradeLast,
  });
}
