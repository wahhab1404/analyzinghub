/**
 * Panel Data Aggregation Endpoint
 *
 * GET /api/indices/panel-data?symbol=SPX
 *
 * Aggregates all data required by the dashboard RightPanel widget:
 *  - Market Sentiment  (Trend Bias, Bull/Bear score, Fear/Greed, Volatility)
 *  - Options Flow      (Call Vol, Put Vol, P/C Ratio, Unusual OI, Gamma Wall)
 *  - Key Levels        (Resistance, Fair Value, Support, Liquidity)
 *  - Market Pulse      (currently active trades)
 *  - Recent Trades     (last N trades for the symbol)
 *
 * Data sources:
 *  - Polygon.io  → index snapshot, VIX snapshot, options chain snapshot
 *  - Supabase    → index_trades table
 *
 * Caching: in-process Map with 30-second TTL to prevent Polygon rate-limit hits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const POLYGON_BASE = 'https://api.polygon.io';
const VALID_SYMBOLS = ['SPX', 'NDX', 'DJI'] as const;
type ValidSymbol = typeof VALID_SYMBOLS[number];

// ─── In-process cache (per symbol) ───────────────────────────────────────────
interface CacheEntry { data: PanelData; expiresAt: number }
const panelCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelSentiment {
  trendBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullScore: number;          // 0–100, 50 = neutral
  fearGreedValue: number | null;  // 0–100
  fearGreedLabel: string | null;  // 'Extreme Fear' … 'Extreme Greed'
  volatility: string | null;      // formatted VIX e.g. "18.4"
  vix: number | null;
}

export interface PanelOptionsFlow {
  callVol: number | null;
  putVol: number | null;
  pcRatio: number | null;    // put / call
  unusualOI: string | null;  // e.g. "5200C" or "5200P"
  gammaWall: number | null;  // strike price
}

export interface PanelKeyLevels {
  resistance: number | null; // session high
  fairValue: number | null;  // intraday HLC/3
  support: number | null;    // session low
  liquidity: number | null;  // previous close — external liquidity reference
}

export interface PulseItem {
  id: string;
  direction: string;
  symbol: string;
  strike: number | null;
  optionType: string | null;
  expiry: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  profitPct: number | null;
  status: string;
  timestamp: string;
}

export interface RecentTradeItem {
  id: string;
  direction: string;
  symbol: string;
  strike: number | null;
  optionType: string | null;
  expiry: string | null;
  entryPrice: number | null;
  currentPrice: number | null;
  highPrice: number | null;
  profitPct: number | null;  // calculated from entry → high price (contract_high_since)
  status: string;
  timestamp: string;
}

export interface PanelData {
  symbol: string;
  sentiment: PanelSentiment;
  optionsFlow: PanelOptionsFlow;
  keyLevels: PanelKeyLevels;
  pulse: PulseItem[];
  recentTrades: RecentTradeItem[];
  lastUpdated: string;
  errors: string[];  // non-fatal partial errors
}

// ─── Pure calculation helpers ────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Convert VIX to Fear/Greed score.
 * Scale: VIX 10 → 100 (Extreme Greed), VIX 40 → 0 (Extreme Fear).
 * Linear interpolation over the 10–40 range, clamped 0–100.
 */
function vixToFearGreed(vix: number): { value: number; label: string } {
  const value = clamp(Math.round(100 - ((vix - 10) / 30) * 100), 0, 100);
  let label: string;
  if (value >= 75) label = 'Extreme Greed';
  else if (value >= 56) label = 'Greed';
  else if (value >= 44) label = 'Neutral';
  else if (value >= 25) label = 'Fear';
  else label = 'Extreme Fear';
  return { value, label };
}

/**
 * Compute Bull score (0–100) from session price data + options flow.
 *
 * Components (each additive on top of neutral base of 50):
 *  1. % change vs prev-close  → max ±20 pts  (momentum)
 *  2. Position in day's range → max ±15 pts  (intraday location)
 *  3. Price vs session open   → ±10 pts      (intraday direction)
 *  4. Options call/put bias   → ±5 pts       (flow signal)
 */
function computeBullScore(p: {
  price: number;
  prevClose: number;
  high: number;
  low: number;
  open: number;
  callVol: number | null;
  putVol: number | null;
}): number {
  let score = 50;

  // 1. Momentum vs prev-close
  if (p.prevClose > 0) {
    const pctChange = ((p.price - p.prevClose) / p.prevClose) * 100;
    score += clamp(pctChange * 10, -20, 20);
  }

  // 2. Range position (−50 to +50 mapped to ±15 pts)
  const range = p.high - p.low;
  if (range > 0) {
    const rangePos = ((p.price - p.low) / range) * 100 - 50;
    score += rangePos * 0.3;
  }

  // 3. Intraday direction vs open
  if (p.open > 0) {
    if (p.price > p.open) score += 10;
    else if (p.price < p.open) score -= 10;
  }

  // 4. Options flow bias
  if (p.callVol != null && p.putVol != null) {
    const total = p.callVol + p.putVol;
    if (total > 0) {
      const flowBias = (p.callVol - p.putVol) / total; // −1 to +1
      score += flowBias * 5;
    }
  }

  return clamp(Math.round(score), 0, 100);
}

/** Format large volume numbers compactly: 1_234_567 → "1.2M" */
function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toString();
}

// ─── Data fetchers (each throws on failure → caller catches) ─────────────────

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 429) {
        // Rate limited — back off slightly
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err: any) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr ?? new Error('Fetch failed');
}

interface IndexSnapshotData {
  price: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

async function fetchIndexSnapshot(
  symbol: string,
  apiKey: string
): Promise<IndexSnapshotData> {
  const ticker = `I:${symbol}`;
  const url = `${POLYGON_BASE}/v3/snapshot/indices?ticker.any_of=${ticker}&apiKey=${apiKey}`;
  const data = await fetchWithRetry(url);
  const result = data.results?.[0];
  if (!result) throw new Error(`No snapshot data for ${symbol}`);

  const price =
    result.value ??
    result.session?.close ??
    result.session?.previous_close;

  if (price == null) throw new Error(`No price in snapshot for ${symbol}`);

  return {
    price: price as number,
    high: (result.session?.high ?? price) as number,
    low: (result.session?.low ?? price) as number,
    open: (result.session?.open ?? price) as number,
    prevClose: (result.session?.previous_close ?? price) as number,
  };
}

async function fetchVix(apiKey: string): Promise<number> {
  const url = `${POLYGON_BASE}/v3/snapshot/indices?ticker.any_of=I:VIX&apiKey=${apiKey}`;
  const data = await fetchWithRetry(url);
  const result = data.results?.[0];
  const vix = result?.value ?? result?.session?.close;
  if (vix == null) throw new Error('No VIX data in snapshot');
  return vix as number;
}

interface OptionsFlowData {
  callVol: number | null;
  putVol: number | null;
  pcRatio: number | null;
  unusualOI: string | null;
  gammaWall: number | null;
}

async function fetchOptionsFlow(
  symbol: string,
  price: number,
  apiKey: string
): Promise<OptionsFlowData> {
  // Near-term ATM ± 5% band, 0–14 DTE, both calls and puts
  const band = 0.05;
  const minStrike = (price * (1 - band)).toFixed(2);
  const maxStrike = (price * (1 + band)).toFixed(2);

  const today = new Date().toISOString().split('T')[0];
  const maxExpiry = new Date();
  maxExpiry.setDate(maxExpiry.getDate() + 14);
  const maxExpiryStr = maxExpiry.toISOString().split('T')[0];

  const params = new URLSearchParams({
    apiKey,
    'strike_price.gte': minStrike,
    'strike_price.lte': maxStrike,
    'expiration_date.gte': today,
    'expiration_date.lte': maxExpiryStr,
    limit: '250',
  });

  const url = `${POLYGON_BASE}/v3/snapshot/options/${symbol}?${params}`;
  console.log(`[PanelData] Fetching options flow for ${symbol}: band ±${band * 100}%, DTE 0-14`);
  const data = await fetchWithRetry(url);

  const contracts: any[] = data.results ?? [];
  if (contracts.length === 0) throw new Error(`No options contracts returned for ${symbol}`);

  console.log(`[PanelData] Options contracts received: ${contracts.length}`);

  let callVol = 0;
  let putVol = 0;

  // Per-strike aggregation for gamma wall and unusual OI
  const strikeMap = new Map<number, {
    callGammaOI: number;
    putGammaOI: number;
    callOI: number;
    putOI: number;
    totalOI: number;
  }>();

  for (const c of contracts) {
    const type: string = c.details?.contract_type ?? '';
    const strike: number = c.details?.strike_price ?? 0;
    const vol: number = c.day?.volume ?? 0;
    const oi: number = c.open_interest ?? 0;
    const gamma: number = c.greeks?.gamma ?? 0;

    if (type === 'call') callVol += vol;
    else if (type === 'put') putVol += vol;

    if (strike > 0) {
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          callGammaOI: 0,
          putGammaOI: 0,
          callOI: 0,
          putOI: 0,
          totalOI: 0,
        });
      }
      const s = strikeMap.get(strike)!;
      const gammaOI = Math.abs(gamma) * oi;
      if (type === 'call') {
        s.callGammaOI += gammaOI;
        s.callOI += oi;
      } else if (type === 'put') {
        s.putGammaOI += gammaOI;
        s.putOI += oi;
      }
      s.totalOI += oi;
    }
  }

  // Gamma Wall: strike with the highest total gamma exposure (|gamma| × OI)
  let gammaWall: number | null = null;
  let maxGammaExp = 0;
  for (const [strike, s] of strikeMap) {
    const totalGammaExp = s.callGammaOI + s.putGammaOI;
    if (totalGammaExp > maxGammaExp) {
      maxGammaExp = totalGammaExp;
      gammaWall = strike;
    }
  }

  // Unusual OI: strike with OI > 1.5× mean OI (find the maximum outlier)
  const allOIs = Array.from(strikeMap.values()).map(s => s.totalOI);
  const meanOI = allOIs.length > 0
    ? allOIs.reduce((a, b) => a + b, 0) / allOIs.length
    : 0;

  let unusualOI: string | null = null;
  let maxOutlierOI = meanOI * 1.5;
  for (const [strike, s] of strikeMap) {
    if (s.totalOI > maxOutlierOI) {
      maxOutlierOI = s.totalOI;
      const dominantType = s.callOI >= s.putOI ? 'C' : 'P';
      unusualOI = `${strike}${dominantType}`;
    }
  }

  const pcRatio = callVol > 0 ? putVol / callVol : null;

  console.log(`[PanelData] Options flow: callVol=${callVol}, putVol=${putVol}, pcRatio=${pcRatio?.toFixed(2)}, gammaWall=${gammaWall}, unusualOI=${unusualOI}`);

  return {
    callVol: callVol > 0 ? callVol : null,
    putVol: putVol > 0 ? putVol : null,
    pcRatio,
    unusualOI,
    gammaWall,
  };
}

function mapTradeRow(row: any): RecentTradeItem {
  const entryPrice: number | null =
    row.original_entry_price != null
      ? Number(row.original_entry_price)
      : row.entry_contract_snapshot?.mid != null
        ? Number(row.entry_contract_snapshot.mid)
        : null;

  const currentPrice: number | null =
    row.current_contract != null ? Number(row.current_contract) : null;

  // Use contract_high_since (peak price since entry) for profit % so the
  // display always reflects the best gain the trade has reached, not the
  // current/last price which may have pulled back.
  const highPrice: number | null =
    row.contract_high_since != null ? Number(row.contract_high_since) : null;

  let profitPct: number | null = null;
  const priceForPct = highPrice ?? currentPrice;
  if (entryPrice != null && entryPrice > 0 && priceForPct != null) {
    profitPct = ((priceForPct - entryPrice) / entryPrice) * 100;
  }

  return {
    id: row.id,
    direction: row.direction ?? '',
    symbol: row.underlying_index_symbol ?? '',
    strike: row.strike != null ? Number(row.strike) : null,
    optionType: row.option_type ?? null,
    expiry: row.expiry ?? null,
    entryPrice,
    currentPrice,
    highPrice,
    profitPct,
    status: row.status ?? '',
    timestamp: row.created_at ?? '',
  };
}

async function fetchRecentTrades(
  symbol: string,
  supabase: ReturnType<typeof createServerClient>
): Promise<{ active: RecentTradeItem[]; recent: RecentTradeItem[] }> {
  const selectCols = [
    'id', 'status', 'direction', 'underlying_index_symbol',
    'strike', 'expiry', 'option_type',
    'entry_contract_snapshot', 'current_contract',
    'contract_high_since', 'original_entry_price', 'created_at',
  ].join(', ');

  const buildQ = (excludeTest: boolean) => {
    let q = supabase
      .from('index_trades')
      .select(selectCols)
      .eq('underlying_index_symbol', symbol)
      .order('created_at', { ascending: false })
      .limit(20); // fetch 20 to split into active + recent

    if (excludeTest) q = q.neq('is_test', true);
    return q;
  };

  let { data: rows, error } = await buildQ(true);
  // Graceful fallback if is_test column doesn't exist yet
  if (error?.code === '42703') {
    ({ data: rows, error } = await buildQ(false));
  }
  if (error) throw new Error(`Trades query failed: ${error.message}`);

  const all = (rows ?? []).map(mapTradeRow);
  const active = all.filter(t => t.status === 'active');
  const recent = all.slice(0, 7);

  return { active, recent };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawSymbol = (request.nextUrl.searchParams.get('symbol') ?? 'SPX').toUpperCase();
    if (!(VALID_SYMBOLS as readonly string[]).includes(rawSymbol)) {
      return NextResponse.json(
        { error: `Invalid symbol: ${rawSymbol}. Must be SPX, NDX, or DJI.` },
        { status: 400 }
      );
    }
    const symbol = rawSymbol as ValidSymbol;

    // ── Cache check ──────────────────────────────────────────────────────────
    const cacheKey = symbol;
    const cached = panelCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[PanelData] Cache hit for ${symbol}`);
      return NextResponse.json(cached.data, {
        headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' },
      });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'POLYGON_API_KEY not configured' },
        { status: 500 }
      );
    }

    const errors: string[] = [];
    const now = new Date().toISOString();

    // ── Parallel fetches (independent, fail gracefully) ──────────────────────
    console.log(`[PanelData] Fetching panel data for ${symbol}`);

    const [indexResult, vixResult, tradesResult] = await Promise.allSettled([
      fetchIndexSnapshot(symbol, apiKey),
      fetchVix(apiKey),
      fetchRecentTrades(symbol, supabase),
    ]);

    // Index snapshot
    let indexSnap: IndexSnapshotData | null = null;
    if (indexResult.status === 'fulfilled') {
      indexSnap = indexResult.value;
      console.log(`[PanelData] Index snapshot: price=${indexSnap.price}, high=${indexSnap.high}, low=${indexSnap.low}`);
    } else {
      const msg = `Index snapshot failed: ${(indexResult.reason as Error)?.message}`;
      console.error(`[PanelData] ${msg}`);
      errors.push(msg);
    }

    // VIX
    let vix: number | null = null;
    if (vixResult.status === 'fulfilled') {
      vix = vixResult.value;
      console.log(`[PanelData] VIX: ${vix}`);
    } else {
      const msg = `VIX fetch failed: ${(vixResult.reason as Error)?.message}`;
      console.warn(`[PanelData] ${msg}`);
      errors.push(msg);
    }

    // Trades (active pulse + recent list)
    let activeTradesArr: RecentTradeItem[] = [];
    let recentTradesArr: RecentTradeItem[] = [];
    if (tradesResult.status === 'fulfilled') {
      activeTradesArr = tradesResult.value.active;
      recentTradesArr = tradesResult.value.recent;
      console.log(`[PanelData] Trades: ${activeTradesArr.length} active, ${recentTradesArr.length} recent`);
    } else {
      const msg = `Trades fetch failed: ${(tradesResult.reason as Error)?.message}`;
      console.warn(`[PanelData] ${msg}`);
      errors.push(msg);
    }

    // Options flow — fetched after index snapshot (needs current price for band)
    // Only attempt if we have a valid price
    let optionsFlowData: OptionsFlowData = {
      callVol: null,
      putVol: null,
      pcRatio: null,
      unusualOI: null,
      gammaWall: null,
    };
    if (indexSnap) {
      try {
        optionsFlowData = await fetchOptionsFlow(symbol, indexSnap.price, apiKey);
      } catch (err: any) {
        const msg = `Options flow failed: ${err?.message}`;
        console.warn(`[PanelData] ${msg}`);
        errors.push(msg);
      }
    }

    // ── Compute derived metrics ───────────────────────────────────────────────

    // Market Sentiment
    let sentiment: PanelSentiment;
    if (indexSnap) {
      const bullScore = computeBullScore({
        price: indexSnap.price,
        prevClose: indexSnap.prevClose,
        high: indexSnap.high,
        low: indexSnap.low,
        open: indexSnap.open,
        callVol: optionsFlowData.callVol,
        putVol: optionsFlowData.putVol,
      });

      const trendBias =
        bullScore >= 57 ? 'BULLISH' :
        bullScore <= 43 ? 'BEARISH' :
        'NEUTRAL';

      const fearGreed = vix != null ? vixToFearGreed(vix) : null;

      sentiment = {
        trendBias,
        bullScore,
        fearGreedValue: fearGreed?.value ?? null,
        fearGreedLabel: fearGreed?.label ?? null,
        volatility: vix != null ? vix.toFixed(1) : null,
        vix,
      };
    } else {
      // No index data available — return safe fallback
      sentiment = {
        trendBias: 'NEUTRAL',
        bullScore: 50,
        fearGreedValue: vix != null ? vixToFearGreed(vix).value : null,
        fearGreedLabel: vix != null ? vixToFearGreed(vix).label : null,
        volatility: vix != null ? vix.toFixed(1) : null,
        vix,
      };
    }

    // Key Levels
    let keyLevels: PanelKeyLevels;
    if (indexSnap) {
      keyLevels = {
        resistance: indexSnap.high,
        // Intraday fair value: HLC/3 (a common VWAP approximation)
        fairValue: Math.round(((indexSnap.high + indexSnap.low + indexSnap.price) / 3) * 100) / 100,
        support: indexSnap.low,
        // Previous close: acts as external liquidity reference / price magnet
        liquidity: indexSnap.prevClose,
      };
    } else {
      keyLevels = { resistance: null, fairValue: null, support: null, liquidity: null };
    }

    const panelData: PanelData = {
      symbol,
      sentiment,
      optionsFlow: optionsFlowData,
      keyLevels,
      pulse: activeTradesArr,
      recentTrades: recentTradesArr,
      lastUpdated: now,
      errors,
    };

    // ── Store in cache ────────────────────────────────────────────────────────
    panelCache.set(cacheKey, { data: panelData, expiresAt: Date.now() + CACHE_TTL_MS });

    console.log(`[PanelData] Returning panel data for ${symbol}, errors: ${errors.length}`);

    return NextResponse.json(panelData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Cache': 'MISS',
      },
    });
  } catch (error: any) {
    console.error('[PanelData] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
