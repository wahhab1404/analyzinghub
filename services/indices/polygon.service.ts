/**
 * Polygon.io Integration Service for Indices Hub
 *
 * Handles all Polygon API calls for:
 * - Index snapshots (I:SPX, I:NDX, I:DJI)
 * - Options contract chains
 * - Options snapshots
 * - Real-time quotes (for publish-time snapshots only)
 *
 * IMPORTANT: This service is SERVER-SIDE ONLY
 * Never expose Polygon API keys to the browser
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

if (!POLYGON_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: POLYGON_API_KEY not set. Polygon integration will fail.');
}

export interface IndexSnapshot {
  ticker: string;
  value: number;
  session: {
    high: number;
    low: number;
    open: number;
    previousClose: number;
  };
  timestamp: string;
}

export interface OptionContract {
  ticker: string;
  strike: number;
  expiry: string;
  optionType: 'call' | 'put';
  underlying: string;
  quote?: {
    bid: number;
    ask: number;
    mid: number;
    last: number;
    volume: number;
    openInterest: number;
    impliedVolatility?: number;
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
}

export interface ContractChainFilters {
  underlying: string; // SPX, NDX, DJI
  expiry?: string; // YYYY-MM-DD
  minStrike?: number;
  maxStrike?: number;
  optionType?: 'call' | 'put';
  minVolume?: number;
  minOpenInterest?: number;
  minPremium?: number;
  maxPremium?: number;
  limit?: number;
}

class PolygonService {
  private async fetchWithRetry(
    url: string,
    retries = 3,
    backoff = 1000
  ): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${POLYGON_API_KEY}`,
          },
        });

        if (response.status === 429) {
          // Rate limited, wait and retry
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff * Math.pow(2, i);
          console.warn(`Polygon rate limited. Retrying after ${waitTime}ms`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Polygon API error (${response.status}): ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
      }
    }
  }

  /**
   * Get current snapshot of an index (I:SPX, I:NDX, I:DJI)
   * Used when publishing trades to capture entry price
   *
   * Uses Polygon's aggregates endpoint to get actual index values
   */
  async getIndexSnapshot(polygonIndexTicker: string): Promise<IndexSnapshot> {
    if (!POLYGON_API_KEY) {
      throw new Error('Polygon API key not configured');
    }

    // Normalize ticker format (ensure "I:" prefix)
    const indexTicker = polygonIndexTicker.startsWith('I:')
      ? polygonIndexTicker
      : `I:${polygonIndexTicker}`;

    // Use aggregates endpoint for previous day's data (most reliable)
    // GET /v2/aggs/ticker/{ticker}/prev
    const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${indexTicker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;

    console.log('Fetching index snapshot:', url.replace(POLYGON_API_KEY!, '[REDACTED]'));

    try {
      const data = await this.fetchWithRetry(url);

      if (!data.results || data.results.length === 0) {
        throw new Error(`No data returned for ${indexTicker}`);
      }

      const result = data.results[0];
      const price = result.c; // Close price
      const high = result.h;
      const low = result.l;
      const open = result.o;

      return {
        ticker: polygonIndexTicker,
        value: price,
        session: {
          high: high,
          low: low,
          open: open,
          previousClose: price, // Using close as previous close for now
        },
        timestamp: new Date(result.t).toISOString(),
      };
    } catch (error) {
      console.error(`Failed to fetch index snapshot for ${indexTicker}:`, error);
      throw new Error(`Failed to fetch ${indexTicker} data. Your Polygon API tier may not include indices data.`);
    }
  }

  /**
   * Get snapshot of an options contract
   * Used when publishing trades to capture entry premium
   */
  async getOptionSnapshot(
    underlyingSymbol: string,
    optionTicker: string
  ): Promise<OptionContract> {
    if (!POLYGON_API_KEY) {
      throw new Error('Polygon API key not configured');
    }

    // Polygon Options Snapshot endpoint
    // GET /v3/snapshot/options/{underlyingAsset}/{optionContract}
    // Note: underlyingAsset is WITHOUT "I:" prefix (e.g., SPX not I:SPX)
    const url = `${POLYGON_BASE_URL}/v3/snapshot/options/${underlyingSymbol}/${optionTicker}?apiKey=${POLYGON_API_KEY}`;

    const data = await this.fetchWithRetry(url);

    if (!data.results) {
      throw new Error(`No data returned for ${optionTicker}`);
    }

    const result = data.results;
    const details = result.details || {};
    const quote = result.last_quote || {};
    const greeks = result.greeks || {};

    // Parse option ticker to extract details
    // Format: O:SPX251219C05900000
    const match = optionTicker.match(/O:([A-Z]+)(\d{6})([CP])(\d+)/);
    let strike = details.strike_price;
    let expiry = details.expiration_date;
    let optionType: 'call' | 'put' = details.contract_type === 'call' ? 'call' : 'put';

    if (match && !strike) {
      const [, , expiryStr, callPut, strikeStr] = match;
      strike = parseFloat(strikeStr) / 1000; // Strike is in thousands
      optionType = callPut === 'C' ? 'call' : 'put';
      // Parse expiry: YYMMDD -> YYYY-MM-DD
      const year = 2000 + parseInt(expiryStr.substring(0, 2));
      const month = expiryStr.substring(2, 4);
      const day = expiryStr.substring(4, 6);
      expiry = `${year}-${month}-${day}`;
    }

    const bid = quote.bid || result.last?.price || 0;
    const ask = quote.ask || result.last?.price || 0;
    const last = result.last?.price || (bid + ask) / 2;
    const mid = (bid + ask) / 2;

    return {
      ticker: optionTicker,
      strike: strike || 0,
      expiry: expiry || '',
      optionType,
      underlying: underlyingSymbol,
      quote: {
        bid,
        ask,
        mid,
        last,
        volume: result.last?.volume || 0,
        openInterest: details.open_interest || 0,
        impliedVolatility: greeks.implied_volatility,
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
      },
    };
  }

  /**
   * Fetch available options contracts for an underlying index
   * Used in the UI to let analysts pick contracts
   * Returns contracts without real-time quotes for faster loading
   */
  async getOptionsChain(filters: ContractChainFilters): Promise<OptionContract[]> {
    if (!POLYGON_API_KEY) {
      throw new Error('Polygon API key not configured');
    }

    // Build query parameters
    const params = new URLSearchParams({
      apiKey: POLYGON_API_KEY,
      limit: (filters.limit || 250).toString(),
      order: 'asc',
      sort: 'expiration_date',
    });

    // Add underlying ticker
    params.append('underlying_ticker', filters.underlying);

    if (filters.expiry) {
      params.append('expiration_date', filters.expiry);
    }

    if (filters.optionType) {
      params.append('contract_type', filters.optionType);
    }

    if (filters.minStrike) {
      params.append('strike_price.gte', filters.minStrike.toString());
    }

    if (filters.maxStrike) {
      params.append('strike_price.lte', filters.maxStrike.toString());
    }

    // Polygon Options Contract endpoint
    // GET /v3/reference/options/contracts
    const url = `${POLYGON_BASE_URL}/v3/reference/options/contracts?${params.toString()}`;

    console.log('[PolygonService] Fetching contracts from:', url.replace(POLYGON_API_KEY!, '[REDACTED]'));
    console.log('[PolygonService] Filters:', JSON.stringify(filters, null, 2));

    try {
      const data = await this.fetchWithRetry(url);

      console.log('[PolygonService] Polygon response status:', data.status);
      console.log('[PolygonService] Results count:', data.results?.length || 0);

      if (!data.results || data.results.length === 0) {
        console.log('[PolygonService] No contracts returned from Polygon');
        console.log('[PolygonService] Response data:', JSON.stringify(data, null, 2));
        return [];
      }

      console.log('[PolygonService] Found', data.results.length, 'contracts from Polygon');
      console.log('[PolygonService] Sample contract:', JSON.stringify(data.results[0], null, 2));

      // Convert contracts to our format (without quotes for fast loading)
      const contracts: OptionContract[] = data.results.map((contract: any) => ({
        ticker: contract.ticker,
        strike: contract.strike_price,
        expiry: contract.expiration_date,
        optionType: contract.contract_type === 'call' ? 'call' : 'put',
        underlying: filters.underlying,
        // No quote data - will be fetched separately for selected contract
      }));

      return contracts;
    } catch (error) {
      console.error('[PolygonService] Error fetching contracts:', error);
      throw error;
    }
  }

  /**
   * Get list of available expiration dates for an underlying
   */
  async getExpirationDates(underlying: string): Promise<string[]> {
    if (!POLYGON_API_KEY) {
      throw new Error('Polygon API key not configured');
    }

    const url = `${POLYGON_BASE_URL}/v3/reference/options/contracts?underlying_ticker=${underlying}&limit=1000&apiKey=${POLYGON_API_KEY}`;

    const data = await this.fetchWithRetry(url);

    if (!data.results) {
      return [];
    }

    // Extract unique expiration dates
    const dates = new Set<string>();
    for (const contract of data.results) {
      if (contract.expiration_date) {
        dates.add(contract.expiration_date);
      }
    }

    // Sort dates
    return Array.from(dates).sort();
  }
}

export const polygonService = new PolygonService();
