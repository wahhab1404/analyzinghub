/**
 * lib/polygon/normalizers.ts
 *
 * Converts raw Polygon API data (WebSocket events or REST responses) into
 * normalised, validated NormalisedContractQuote objects.
 *
 * Smart-hybrid premium strategy (in preference order):
 *   1. Mid price — when both bid and ask are positive and spread ≤ SPREAD_LIMIT
 *   2. Last trade price — when available and not suspiciously stale
 *   3. Bid price — when available (option buyers typically see bid as worst fill)
 *   4. Ask price × DISCOUNT_FACTOR — rough approximation
 *   5. null — no valid price can be determined
 *
 * Prices are rejected when:
 *   - value is 0, negative, NaN, or Infinity
 *   - the event timestamp is more than MAX_QUOTE_AGE_MS old (market-hours only)
 *   - bid > ask (crossed market — likely a stale feed artefact)
 */

import type {
  NormalisedContractQuote,
  NormalisedIndexQuote,
  PolygonOptionQuoteEvent,
  PolygonOptionTradeEvent,
  PolygonOptionSnapshot,
  PremiumSource,
} from './types';

// ── CONFIG ────────────────────────────────────────────────────────────────────

/** Maximum bid-ask spread (as fraction of mid) before we distrust mid price */
const SPREAD_LIMIT = 0.50; // 50 % of mid — very wide options can have this

/** Discount applied to ask-only fallback (simulates realistic fill closer to mid) */
const ASK_DISCOUNT = 0.95;

/** Maximum age (ms) of a quote before we consider it stale during RTH */
const MAX_QUOTE_AGE_MS = 5 * 60 * 1000; // 5 minutes

// ── HELPERS ───────────────────────────────────────────────────────────────────

function isPositive(v: number | null | undefined): v is number {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

function nsToDate(nanos: number): Date {
  return new Date(Math.floor(nanos / 1_000_000));
}

function msToDate(ms: number): Date {
  return new Date(ms);
}

function isStale(eventAt: Date, maxAgeMs = MAX_QUOTE_AGE_MS): boolean {
  return Date.now() - eventAt.getTime() > maxAgeMs;
}

function computeSmartPrice(
  bid: number,
  ask: number,
  lastTrade: number
): { price: number | null; source: PremiumSource } {
  // Guard: crossed market
  if (isPositive(bid) && isPositive(ask) && bid > ask) {
    // Crossed — use last trade if available
    if (isPositive(lastTrade)) {
      return { price: lastTrade, source: 'last_trade' };
    }
    return { price: null, source: 'unknown' };
  }

  // 1. Mid price (preferred when spread is narrow enough)
  if (isPositive(bid) && isPositive(ask)) {
    const mid = (bid + ask) / 2;
    const spread = ask - bid;
    const spreadFraction = mid > 0 ? spread / mid : 1;
    if (spreadFraction <= SPREAD_LIMIT) {
      return { price: parseFloat(mid.toFixed(4)), source: 'mid' };
    }
  }

  // 2. Last trade
  if (isPositive(lastTrade)) {
    return { price: lastTrade, source: 'last_trade' };
  }

  // 3. Bid only
  if (isPositive(bid)) {
    return { price: bid, source: 'bid' };
  }

  // 4. Ask × discount
  if (isPositive(ask)) {
    return { price: parseFloat((ask * ASK_DISCOUNT).toFixed(4)), source: 'ask' };
  }

  return { price: null, source: 'unknown' };
}

// ── NORMALISERS ───────────────────────────────────────────────────────────────

/**
 * Normalise a Polygon WebSocket Quote event (ev: "Q") for an option.
 */
export function normaliseOptionQuoteEvent(
  event: PolygonOptionQuoteEvent
): NormalisedContractQuote {
  const eventAt = nsToDate(event.t);
  const bid = isPositive(event.bp) ? event.bp : 0;
  const ask = isPositive(event.ap) ? event.ap : 0;
  const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null;

  const { price: smartPrice, source: premiumSource } = computeSmartPrice(bid, ask, 0);

  const isValid = smartPrice !== null && !isStale(eventAt);
  const invalidReason = !isValid
    ? smartPrice === null
      ? 'no_valid_price'
      : 'stale_event'
    : undefined;

  return {
    ticker: event.sym.startsWith('O:') ? event.sym : `O:${event.sym}`,
    bid,
    ask,
    mid,
    lastTrade: 0,
    volume: 0,
    smartPrice,
    premiumSource: premiumSource as PremiumSource,
    eventAt,
    isValid,
    invalidReason,
  };
}

/**
 * Normalise a Polygon WebSocket Trade event (ev: "T") for an option.
 */
export function normaliseOptionTradeEvent(
  event: PolygonOptionTradeEvent
): NormalisedContractQuote {
  const eventAt = nsToDate(event.t);
  const lastTrade = isPositive(event.p) ? event.p : 0;

  const { price: smartPrice, source: premiumSource } = computeSmartPrice(0, 0, lastTrade);

  const isValid = smartPrice !== null && !isStale(eventAt);
  const invalidReason = !isValid
    ? smartPrice === null
      ? 'no_valid_price'
      : 'stale_event'
    : undefined;

  return {
    ticker: event.sym.startsWith('O:') ? event.sym : `O:${event.sym}`,
    bid: 0,
    ask: 0,
    mid: null,
    lastTrade,
    volume: event.s,
    smartPrice,
    premiumSource: premiumSource as PremiumSource,
    eventAt,
    isValid,
    invalidReason,
  };
}

/**
 * Merge a quote event and an optional trade event into a single normalised quote.
 * When both arrive for the same tick, this produces the best possible estimate.
 */
export function mergeQuoteAndTrade(
  quoteEvent: PolygonOptionQuoteEvent | null,
  tradeEvent: PolygonOptionTradeEvent | null
): NormalisedContractQuote | null {
  if (!quoteEvent && !tradeEvent) return null;

  const bid = quoteEvent && isPositive(quoteEvent.bp) ? quoteEvent.bp : 0;
  const ask = quoteEvent && isPositive(quoteEvent.ap) ? quoteEvent.ap : 0;
  const lastTrade = tradeEvent && isPositive(tradeEvent.p) ? tradeEvent.p : 0;
  const volume = tradeEvent?.s ?? 0;

  // Use the most recent timestamp from either event
  const quoteTs = quoteEvent ? nsToDate(quoteEvent.t) : null;
  const tradeTs = tradeEvent ? nsToDate(tradeEvent.t) : null;
  const eventAt = quoteTs && tradeTs
    ? quoteTs > tradeTs ? quoteTs : tradeTs
    : quoteTs ?? tradeTs ?? new Date();

  const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null;
  const { price: smartPrice, source: premiumSource } = computeSmartPrice(bid, ask, lastTrade);

  const ticker = (quoteEvent?.sym ?? tradeEvent?.sym ?? '');

  const isValid = smartPrice !== null && !isStale(eventAt);

  return {
    ticker: ticker.startsWith('O:') ? ticker : `O:${ticker}`,
    bid,
    ask,
    mid,
    lastTrade,
    volume,
    smartPrice,
    premiumSource: premiumSource as PremiumSource,
    eventAt,
    isValid,
    invalidReason: !isValid ? (smartPrice === null ? 'no_valid_price' : 'stale_event') : undefined,
  };
}

/**
 * Normalise a Polygon REST snapshot response for an option contract.
 * Used as the fallback when streaming is not available.
 */
export function normaliseOptionSnapshot(
  ticker: string,
  snapshot: PolygonOptionSnapshot
): NormalisedContractQuote {
  const lastQuote = snapshot.last_quote ?? {};
  const bid = isPositive(lastQuote.bid as number) ? (lastQuote.bid as number) : 0;
  const ask = isPositive(lastQuote.ask as number) ? (lastQuote.ask as number) : 0;
  const lastTrade = isPositive(lastQuote.last_price as number) ? (lastQuote.last_price as number) : 0;

  const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(4)) : null;
  const { price: smartPrice, source: premiumSource } = computeSmartPrice(bid, ask, lastTrade);

  const isValid = smartPrice !== null;

  return {
    ticker: ticker.startsWith('O:') ? ticker : `O:${ticker}`,
    bid,
    ask,
    mid,
    lastTrade,
    volume: snapshot.day?.volume ?? 0,
    smartPrice,
    premiumSource: isValid ? 'snapshot' : 'unknown',
    eventAt: new Date(),
    isValid,
    invalidReason: !isValid ? 'no_valid_price' : undefined,
  };
}

/**
 * Normalise a Polygon index value event for SPX/NDX/DJI.
 */
export function normaliseIndexValue(
  ticker: string,
  value: number,
  eventAtMs: number
): NormalisedIndexQuote {
  return {
    ticker,
    value,
    eventAt: msToDate(eventAtMs),
  };
}
