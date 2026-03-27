/**
 * lib/polygon/rest.ts
 *
 * Typed REST methods for the Polygon API endpoints used by this platform.
 * Builds on lib/polygon/client.ts and lib/polygon/normalizers.ts.
 *
 * Server-side only.
 */

import { polygonFetch, PolygonClientOptions, PolygonError } from './client';
import {
  normaliseOptionSnapshot,
  normaliseIndexValue,
} from './normalizers';
import type {
  NormalisedContractQuote,
  NormalisedIndexQuote,
  PolygonOptionSnapshot,
} from './types';

// ── OPTIONS ───────────────────────────────────────────────────────────────────

/**
 * Fetch a real-time snapshot for a single option contract.
 *
 * Tries the v3 single-contract snapshot first; falls back to the v3 quotes
 * endpoint if the snapshot returns no quote data.
 *
 * @param underlying  Underlying symbol WITHOUT "I:" prefix, e.g. "SPX"
 * @param optionTicker  Full Polygon ticker, e.g. "O:SPX251219C05900000"
 */
export async function fetchOptionSnapshot(
  underlying: string,
  optionTicker: string,
  opts?: PolygonClientOptions
): Promise<NormalisedContractQuote> {
  const cleanTicker = optionTicker.startsWith('O:') ? optionTicker : `O:${optionTicker}`;
  const options = { logPrefix: '[Polygon/REST]', ...opts };

  // ── Primary: v3 snapshot endpoint ────────────────────────────────────────
  try {
    const data = await polygonFetch<{ results?: PolygonOptionSnapshot; status?: string }>(
      `/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(cleanTicker)}`,
      {},
      options
    );

    if (data?.results) {
      const quote = normaliseOptionSnapshot(cleanTicker, data.results);
      if (quote.isValid) {
        return quote;
      }
    }
  } catch (err: any) {
    if (!(err instanceof PolygonError) || err.status >= 500) {
      throw err; // Re-throw network / server errors
    }
    console.warn(`[Polygon/REST] Snapshot failed for ${cleanTicker} (${err.status}), trying quotes endpoint`);
  }

  // ── Fallback: v3 quotes endpoint ──────────────────────────────────────────
  const quotesData = await polygonFetch<{ results?: any[]; status?: string }>(
    `/v3/quotes/${encodeURIComponent(cleanTicker)}`,
    { limit: '1', order: 'desc', sort: 'timestamp' },
    options
  );

  if (quotesData?.results && quotesData.results.length > 0) {
    const q = quotesData.results[0];
    const bid = q.bid_price ?? 0;
    const ask = q.ask_price ?? 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;

    return normaliseOptionSnapshot(cleanTicker, {
      last_quote: {
        bid,
        ask,
        last_price: 0,
      },
    } as PolygonOptionSnapshot);
  }

  throw new PolygonError(404, `No quote data available for ${cleanTicker}`);
}

/**
 * Bulk-fetch snapshots for multiple option contracts in a single call.
 * Returns a map of ticker → NormalisedContractQuote.
 *
 * Note: Polygon's /v3/snapshot/options/{underlying} endpoint supports
 * comma-separated tickers via the `ticker.any_of` query parameter but
 * caps at ~250 tickers per request. For large batches, batch the calls.
 */
export async function fetchOptionSnapshotsBulk(
  underlying: string,
  tickers: string[],
  opts?: PolygonClientOptions
): Promise<Map<string, NormalisedContractQuote>> {
  const result = new Map<string, NormalisedContractQuote>();
  if (tickers.length === 0) return result;

  const BATCH_SIZE = 50;
  const cleanTickers = tickers.map(t => t.startsWith('O:') ? t : `O:${t}`);
  const options = { logPrefix: '[Polygon/REST/Bulk]', ...opts };

  for (let i = 0; i < cleanTickers.length; i += BATCH_SIZE) {
    const batch = cleanTickers.slice(i, i + BATCH_SIZE);
    try {
      const data = await polygonFetch<{ results?: PolygonOptionSnapshot[]; status?: string }>(
        `/v3/snapshot/options/${encodeURIComponent(underlying)}`,
        { 'ticker.any_of': batch.join(',') },
        options
      );

      for (const snapshot of data?.results ?? []) {
        const ticker = snapshot.ticker ?? '';
        if (ticker) {
          const quote = normaliseOptionSnapshot(ticker, snapshot);
          result.set(ticker, quote);
        }
      }
    } catch (err) {
      console.error(`[Polygon/REST/Bulk] Batch snapshot failed for underlying ${underlying}:`, err);
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < cleanTickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return result;
}

// ── INDEX ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the current value of an index (I:SPX, I:NDX, I:DJI).
 */
export async function fetchIndexSnapshot(
  indexTicker: string,
  opts?: PolygonClientOptions
): Promise<NormalisedIndexQuote> {
  const ticker = indexTicker.startsWith('I:') ? indexTicker : `I:${indexTicker}`;
  const options = { logPrefix: '[Polygon/REST/Index]', ...opts };

  const data = await polygonFetch<{ results?: any[]; status?: string }>(
    '/v3/snapshot',
    { 'ticker.any_of': ticker },
    options
  );

  if (!data?.results || data.results.length === 0) {
    throw new PolygonError(404, `No snapshot data for index ${ticker}`);
  }

  const result = data.results[0];
  const price =
    result.value ??
    result.session?.close ??
    result.session?.previous_close;

  if (!price || price <= 0) {
    throw new PolygonError(422, `Invalid price in snapshot for ${ticker}`);
  }

  return normaliseIndexValue(
    ticker,
    price,
    result.updated ?? Date.now()
  );
}

// ── CONTRACT REFERENCE ────────────────────────────────────────────────────────

/**
 * Fetch available option contracts for an underlying (for the contract picker).
 */
export async function fetchOptionContracts(
  underlying: string,
  filters: {
    expiry?: string;
    optionType?: 'call' | 'put';
    minStrike?: number;
    maxStrike?: number;
    limit?: number;
  } = {},
  opts?: PolygonClientOptions
): Promise<any[]> {
  const params: Record<string, string> = {
    underlying_ticker: underlying,
    limit: String(filters.limit ?? 250),
    order: 'asc',
    sort: 'expiration_date',
  };

  if (filters.expiry)     params['expiration_date']    = filters.expiry;
  if (filters.optionType) params['contract_type']       = filters.optionType;
  if (filters.minStrike)  params['strike_price.gte']    = String(filters.minStrike);
  if (filters.maxStrike)  params['strike_price.lte']    = String(filters.maxStrike);

  const data = await polygonFetch<{ results?: any[]; status?: string }>(
    '/v3/reference/options/contracts',
    params,
    { logPrefix: '[Polygon/REST/Contracts]', ...opts }
  );

  return data?.results ?? [];
}
