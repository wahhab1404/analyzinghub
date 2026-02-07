/**
 * Enhanced Options Chain Service for Indices Hub
 *
 * Implements robust ATM-centered strike selection using Polygon's Option Chain Snapshot API
 *
 * Key Features:
 * - Anchors strikes around current underlying price (ATM/near-ATM)
 * - Auto-detects strike increments (tick size)
 * - DTE (Days To Expiration) filtering
 * - Liquidity filtering (volume/OI)
 * - Directional strike selection (calls vs puts)
 * - Supabase caching with TTL
 * - Numeric sorting (no string sort bugs)
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Configuration defaults
const DEFAULT_CONFIG = {
  percentBand: 0.02, // 2% band around ATM (tighter for better ATM focus)
  minDTE: 0, // Allow 0DTE
  maxDTE: 45, // 45 days max
  maxExpirations: 5, // Top 5 nearest expirations
  strikesPerExpiration: 15, // 15 strikes per expiration (show nearest 15)
  includeOneITM: true, // Include 1 ITM strike
  minVolume: 0, // Minimum volume
  minOpenInterest: 0, // Minimum OI
  cacheTTL: 5, // Cache TTL in seconds (5 seconds for live updates)
};

export interface OptionsChainConfig {
  underlying: string; // SPX, NDX, DJI
  contractType: 'call' | 'put';
  percentBand?: number; // % band around ATM (default 3%)
  minDTE?: number; // Min days to expiration
  maxDTE?: number; // Max days to expiration
  maxExpirations?: number; // Max expirations to return
  strikesPerExpiration?: number; // Strikes per expiration
  includeOneITM?: boolean; // Include 1 ITM strike
  minVolume?: number;
  minOpenInterest?: number;
}

export interface StrikeContract {
  strike: number;
  ticker: string;
  bid?: number;
  ask?: number;
  mid?: number;
  last?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface ExpirationGroup {
  expirationDate: string;
  dte: number; // Days to expiration
  strikes: StrikeContract[];
}

export interface OptionsChainResponse {
  underlying: string;
  underlyingPrice: number;
  contractType: 'call' | 'put';
  strikeStep: number; // Auto-detected strike increment
  generatedAt: string;
  expirations: ExpirationGroup[];
  metadata: {
    totalContracts: number;
    percentBand: number;
    minStrike: number;
    maxStrike: number;
    cached: boolean;
  };
}

class OptionsChainService {
  /**
   * Fetch with retry logic and rate limiting
   */
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
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : backoff * Math.pow(2, i);
          console.warn(`[OptionsChain] Rate limited. Retrying after ${waitTime}ms`);
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
   * Get underlying price from index snapshot (LIVE/REAL-TIME)
   */
  private async getUnderlyingPrice(underlying: string): Promise<number> {
    // Use REAL-TIME snapshot endpoint for live prices
    const indexTicker = underlying.startsWith('I:') ? underlying : `I:${underlying}`;
    const url = `${POLYGON_BASE_URL}/v3/snapshot?ticker.any_of=${indexTicker}&apiKey=${POLYGON_API_KEY}`;

    console.log('[OptionsChain] Fetching LIVE underlying price for:', underlying);

    try {
      const data = await this.fetchWithRetry(url);

      if (!data.results || data.results.length === 0) {
        throw new Error(`No price data for ${underlying}`);
      }

      const result = data.results[0];
      // Use current value (live), fallback to session close, then previous close
      const price = result.value || result.session?.close || result.session?.previous_close;

      if (!price) {
        throw new Error(`No valid price found in snapshot for ${underlying}`);
      }

      console.log('[OptionsChain] LIVE Underlying price:', price);
      console.log('[OptionsChain] Price timestamp:', result.updated);
      return price;
    } catch (error) {
      console.error('[OptionsChain] Error fetching underlying price:', error);
      throw new Error(`Failed to fetch underlying price for ${underlying}`);
    }
  }

  /**
   * Detect strike step (tick size) from contract strikes
   */
  private detectStrikeStep(strikes: number[], underlyingPrice: number): number {
    if (strikes.length < 2) return 5; // Default fallback

    // Get strikes near ATM (within 10%)
    const atmStrikes = strikes
      .filter(s => Math.abs(s - underlyingPrice) / underlyingPrice < 0.1)
      .sort((a, b) => a - b);

    if (atmStrikes.length < 2) {
      // Use all strikes if not enough near ATM
      atmStrikes.push(...strikes.sort((a, b) => a - b));
    }

    // Compute differences between adjacent strikes
    const diffs: number[] = [];
    for (let i = 1; i < atmStrikes.length; i++) {
      const diff = atmStrikes[i] - atmStrikes[i - 1];
      if (diff > 0) diffs.push(diff);
    }

    if (diffs.length === 0) return 5;

    // Find mode (most common difference)
    const diffCounts = new Map<number, number>();
    for (const diff of diffs) {
      diffCounts.set(diff, (diffCounts.get(diff) || 0) + 1);
    }

    const mode = Array.from(diffCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];

    console.log('[OptionsChain] Detected strike step:', mode);
    return mode;
  }

  /**
   * Calculate days to expiration
   */
  private calculateDTE(expirationDate: string): number {
    const expiry = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Filter contracts by liquidity
   * Be more lenient for contracts very close to ATM
   */
  private hasLiquidity(contract: any, config: OptionsChainConfig, underlyingPrice?: number): boolean {
    const volume = contract.day?.volume || 0;
    const openInterest = contract.open_interest || 0;
    const hasBidAsk = contract.last_quote?.bid > 0 || contract.last_quote?.ask > 0;
    const hasLast = contract.last_trade?.price > 0;

    // For contracts very close to ATM (within 1% of underlying), be very lenient
    if (underlyingPrice) {
      const strike = contract.details.strike_price;
      const distancePercent = Math.abs(strike - underlyingPrice) / underlyingPrice;

      if (distancePercent < 0.01) { // Within 1% of ATM
        // ATM strikes: accept if there's any quote or trade data at all
        if (hasBidAsk || hasLast || openInterest > 0) return true;
      }
    }

    // Must have at least one of: volume, OI, bid/ask, or last trade
    const hasAnyActivity = volume > 0 || openInterest > 0 || hasBidAsk || hasLast;
    if (!hasAnyActivity) return false;

    // Check minimum thresholds (only if specified)
    if (config.minVolume && volume < config.minVolume) return false;
    if (config.minOpenInterest && openInterest < config.minOpenInterest) return false;

    return true;
  }

  /**
   * Select strikes based on direction and ATM anchoring
   * For CALLS: Prioritize OTM strikes (above current price)
   * For PUTS: Prioritize OTM strikes (below current price)
   */
  private selectStrikes(
    contracts: any[],
    underlyingPrice: number,
    contractType: 'call' | 'put',
    config: OptionsChainConfig
  ): StrikeContract[] {
    const strikesCount = config.strikesPerExpiration || DEFAULT_CONFIG.strikesPerExpiration;
    const includeOneITM = config.includeOneITM ?? DEFAULT_CONFIG.includeOneITM;

    // Separate ITM and OTM contracts
    const itm: any[] = [];
    const otm: any[] = [];

    for (const contract of contracts) {
      const strike = contract.details.strike_price;

      if (contractType === 'call') {
        // For calls: ITM = strike < price, OTM = strike > price
        if (strike < underlyingPrice) {
          itm.push(contract);
        } else {
          otm.push(contract);
        }
      } else {
        // For puts: ITM = strike > price, OTM = strike < price
        if (strike > underlyingPrice) {
          itm.push(contract);
        } else {
          otm.push(contract);
        }
      }
    }

    // Sort ITM by distance from ATM (nearest first)
    itm.sort((a, b) => {
      const distA = Math.abs(a.details.strike_price - underlyingPrice);
      const distB = Math.abs(b.details.strike_price - underlyingPrice);
      return distA - distB;
    });

    // Sort OTM by distance from ATM (nearest first)
    otm.sort((a, b) => {
      const distA = Math.abs(a.details.strike_price - underlyingPrice);
      const distB = Math.abs(b.details.strike_price - underlyingPrice);
      return distA - distB;
    });

    // Build selection: prioritize OTM, include 1 ITM if requested
    let selected: any[] = [];

    if (includeOneITM && itm.length > 0) {
      // Include closest ITM strike
      selected.push(itm[0]);
      // Fill rest with OTM
      selected.push(...otm.slice(0, strikesCount - 1));
    } else {
      // All OTM strikes
      selected = otm.slice(0, strikesCount);
    }

    // Sort final selection by strike (ascending) for display
    selected.sort((a, b) => a.details.strike_price - b.details.strike_price);

    // Map to StrikeContract format
    return selected.map(c => {
      const bid = c.last_quote?.bid || 0;
      const ask = c.last_quote?.ask || 0;
      const last = c.last_trade?.price || 0;
      const mid = bid && ask ? (bid + ask) / 2 : last;

      return {
        strike: c.details.strike_price,
        ticker: c.details.ticker,
        bid: bid || undefined,
        ask: ask || undefined,
        mid: mid || undefined,
        last: last || undefined,
        volume: c.day?.volume || undefined,
        openInterest: c.open_interest || undefined,
        impliedVolatility: c.implied_volatility || undefined,
        delta: c.greeks?.delta || undefined,
        gamma: c.greeks?.gamma || undefined,
        theta: c.greeks?.theta || undefined,
        vega: c.greeks?.vega || undefined,
      };
    });
  }

  /**
   * Main method: Get curated options chain with ATM-centered strikes
   */
  async getOptionsChain(config: OptionsChainConfig): Promise<OptionsChainResponse> {
    if (!POLYGON_API_KEY) {
      throw new Error('Polygon API key not configured');
    }

    // Validate and normalize input
    const underlying = config.underlying.toUpperCase().trim();
    if (!['SPX', 'NDX', 'DJI'].includes(underlying)) {
      throw new Error(`Invalid underlying: ${underlying}. Must be SPX, NDX, or DJI`);
    }

    const contractType = config.contractType;
    if (!['call', 'put'].includes(contractType)) {
      throw new Error(`Invalid contract type: ${contractType}`);
    }

    console.log('[OptionsChain] Fetching options chain:', { underlying, contractType });

    // Get underlying price first
    const underlyingPrice = await this.getUnderlyingPrice(underlying);

    // Calculate strike band
    const percentBand = config.percentBand ?? DEFAULT_CONFIG.percentBand;
    const minStrike = underlyingPrice * (1 - percentBand);
    const maxStrike = underlyingPrice * (1 + percentBand);

    console.log('[OptionsChain] Strike band:', { minStrike, maxStrike, percentBand });

    // Calculate DTE range
    const minDTE = config.minDTE ?? DEFAULT_CONFIG.minDTE;
    const maxDTE = config.maxDTE ?? DEFAULT_CONFIG.maxDTE;
    const today = new Date();
    const minDate = new Date(today);
    minDate.setDate(today.getDate() + minDTE);
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + maxDTE);

    // Build Option Chain Snapshot API URL with filters
    const params = new URLSearchParams({
      apiKey: POLYGON_API_KEY,
      'contract_type': contractType,
      'strike_price.gte': minStrike.toFixed(2),
      'strike_price.lte': maxStrike.toFixed(2),
      'expiration_date.gte': minDate.toISOString().split('T')[0],
      'expiration_date.lte': maxDate.toISOString().split('T')[0],
      limit: '250', // Polygon max limit is 250
    });

    const url = `${POLYGON_BASE_URL}/v3/snapshot/options/${underlying}?${params.toString()}`;

    console.log('[OptionsChain] Fetching from Polygon:', url.replace(POLYGON_API_KEY!, '[REDACTED]'));

    let data;
    try {
      data = await this.fetchWithRetry(url);
    } catch (error) {
      console.error('[OptionsChain] Polygon API error:', error);
      throw new Error(`Failed to fetch options chain: ${error}`);
    }

    if (!data.results || data.results.length === 0) {
      console.warn('[OptionsChain] No contracts returned from Polygon');
      return {
        underlying,
        underlyingPrice,
        contractType,
        strikeStep: 5,
        generatedAt: new Date().toISOString(),
        expirations: [],
        metadata: {
          totalContracts: 0,
          percentBand,
          minStrike,
          maxStrike,
          cached: false,
        },
      };
    }

    console.log('[OptionsChain] Received', data.results.length, 'contracts from Polygon');

    // Log strikes near ATM
    const nearestStrikes = data.results
      .map((c: any) => c.details.strike_price)
      .sort((a: number, b: number) => Math.abs(a - underlyingPrice) - Math.abs(b - underlyingPrice))
      .slice(0, 10);
    console.log('[OptionsChain] Nearest 10 strikes to', underlyingPrice, ':', nearestStrikes);

    // Filter by liquidity (pass underlyingPrice for ATM prioritization)
    const liquidContracts = data.results.filter((c: any) => this.hasLiquidity(c, config, underlyingPrice));
    console.log('[OptionsChain] After liquidity filter:', liquidContracts.length, 'contracts');

    // Log liquid strikes near ATM
    const liquidStrikes = liquidContracts
      .map((c: any) => c.details.strike_price)
      .sort((a: number, b: number) => Math.abs(a - underlyingPrice) - Math.abs(b - underlyingPrice))
      .slice(0, 10);
    console.log('[OptionsChain] Nearest 10 liquid strikes:', liquidStrikes);

    if (liquidContracts.length === 0) {
      return {
        underlying,
        underlyingPrice,
        contractType,
        strikeStep: 5,
        generatedAt: new Date().toISOString(),
        expirations: [],
        metadata: {
          totalContracts: 0,
          percentBand,
          minStrike,
          maxStrike,
          cached: false,
        },
      };
    }

    // Detect strike step
    const allStrikes = liquidContracts.map((c: any) => c.details.strike_price);
    const strikeStep = this.detectStrikeStep(allStrikes, underlyingPrice);

    // Group by expiration
    const expirationMap = new Map<string, any[]>();
    for (const contract of liquidContracts) {
      const expiry = contract.details.expiration_date;
      if (!expirationMap.has(expiry)) {
        expirationMap.set(expiry, []);
      }
      expirationMap.get(expiry)!.push(contract);
    }

    // Sort expirations by date and take nearest K
    const maxExpirations = config.maxExpirations ?? DEFAULT_CONFIG.maxExpirations;
    const sortedExpirations = Array.from(expirationMap.keys())
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .slice(0, maxExpirations);

    console.log('[OptionsChain] Selected expirations:', sortedExpirations);

    // Build expiration groups with curated strikes
    const expirations: ExpirationGroup[] = sortedExpirations.map(expiry => {
      const contracts = expirationMap.get(expiry)!;
      const strikes = this.selectStrikes(contracts, underlyingPrice, contractType, config);
      const dte = this.calculateDTE(expiry);

      return {
        expirationDate: expiry,
        dte,
        strikes,
      };
    });

    const totalContracts = expirations.reduce((sum, exp) => sum + exp.strikes.length, 0);

    console.log('[OptionsChain] Final result:', {
      expirations: expirations.length,
      totalContracts,
      strikeStep,
    });

    return {
      underlying,
      underlyingPrice,
      contractType,
      strikeStep,
      generatedAt: new Date().toISOString(),
      expirations,
      metadata: {
        totalContracts,
        percentBand,
        minStrike,
        maxStrike,
        cached: false,
      },
    };
  }
}

export const optionsChainService = new OptionsChainService();
