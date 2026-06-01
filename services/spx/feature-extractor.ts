/**
 * services/spx/feature-extractor.ts
 *
 * Phase 2 — Feature Extraction Engine
 *
 * Computes the full set of SPXFeatures by combining:
 *   1. Live index price from Polygon REST snapshot
 *   2. Rolling price history from spx_price_history (stored in Supabase)
 *   3. Options chain snapshot (both calls + puts) from Polygon
 *
 * IMPORTANT: This service is SERVER-SIDE ONLY.
 * It stores a price snapshot to spx_price_history on each call so that
 * trend/momentum/VWAP metrics accumulate over time.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  SPXFeatures,
  UnderlyingFeatures,
  OptionsChainFeatures,
  GreeksFeatures,
  FlowFeatures,
  ExecutionFeatures,
  TrendDirection,
  MarketMode,
  SessionType,
  DTERegime,
} from './types';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function polygonFetch(path: string): Promise<any> {
  if (!POLYGON_API_KEY) throw new Error('POLYGON_API_KEY not configured');
  const url = `${POLYGON_BASE_URL}${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_API_KEY}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${POLYGON_API_KEY}` },
        next: { revalidate: 0 },
      });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('Retry-After') || '1') * 1000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Polygon ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

/** Clamp a value to [0, 100] */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Simple linear regression slope over an array of y-values (x = index). */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Determine trading session type from UTC timestamp. */
function getSessionType(now: Date): SessionType {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return 'weekend';
  // Determine ET offset: EDT (UTC-4) Mar 2nd Sun – Nov 1st Sun, EST (UTC-5) otherwise
  const year = now.getUTCFullYear();
  // DST starts: 2nd Sunday of March at 2:00 ET
  const dstStart = new Date(Date.UTC(year, 2, 8 - ((new Date(Date.UTC(year, 2, 1)).getUTCDay() + 6) % 7), 7)); // 07:00 UTC = 2:00 EST
  // DST ends: 1st Sunday of November at 2:00 ET
  const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - new Date(Date.UTC(year, 10, 1)).getUTCDay()) % 7), 6)); // 06:00 UTC = 2:00 EDT
  const isDST = now >= dstStart && now < dstEnd;
  const etOffset = isDST ? 4 : 5;
  const etHour = (now.getUTCHours() - etOffset + 24) % 24 + now.getUTCMinutes() / 60;
  if (etHour >= 9.5 && etHour < 16) return 'regular';
  if (etHour >= 4 && etHour < 9.5) return 'pre_market';
  if (etHour >= 16 && etHour < 20) return 'after_hours';
  return 'pre_market';
}

function calculateDTE(expirationDate: string): number {
  const expiry = new Date(expirationDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((expiry.getTime() - today.getTime()) / 86400000));
}

function getDTERegime(dte: number): DTERegime {
  if (dte === 0) return '0DTE';
  if (dte === 1) return '1DTE';
  if (dte <= 7) return 'Weekly';
  if (dte <= 35) return 'Monthly';
  return 'Other';
}

// ── UNDERLYING FEATURE COMPUTATION ───────────────────────────────────────────

async function fetchIndexSnapshot(): Promise<{
  price: number;
  sessionOpen: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  previousClose: number | null;
  timestamp: string;
}> {
  const data = await polygonFetch('/v3/snapshot?ticker.any_of=I:SPX');
  const result = data.results?.[0];
  if (!result) throw new Error('No SPX snapshot returned from Polygon');

  const price =
    result.value ??
    result.session?.close ??
    result.session?.previous_close;
  if (!price) throw new Error('No valid SPX price in snapshot');

  return {
    price,
    sessionOpen: result.session?.open ?? null,
    sessionHigh: result.session?.high ?? null,
    sessionLow: result.session?.low ?? null,
    previousClose: result.session?.previous_close ?? null,
    timestamp: result.updated
      ? new Date(result.updated).toISOString()
      : new Date().toISOString(),
  };
}

async function storePriceHistory(
  supabase: ReturnType<typeof createClient>,
  price: number,
  sessionOpen: number | null,
  sessionHigh: number | null,
  sessionLow: number | null,
  prevClose: number | null,
): Promise<void> {
  const { error } = await supabase.from('spx_price_history').insert({
    price,
    source: 'polygon_snapshot',
    session_open: sessionOpen,
    session_high: sessionHigh,
    session_low: sessionLow,
    prev_close: prevClose,
  });
  if (error) {
    console.error('[FeatureExtractor] Failed to store price history:', error.message);
  }
}

async function loadRecentHistory(
  supabase: ReturnType<typeof createClient>,
  minutes: number,
): Promise<Array<{ captured_at: string; price: number }>> {
  const { data, error } = await supabase
    .from('spx_price_history')
    .select('captured_at, price')
    .gte('captured_at', new Date(Date.now() - minutes * 60_000).toISOString())
    .order('captured_at', { ascending: true });

  if (error) {
    console.warn('[FeatureExtractor] Failed to load price history:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Compute trend direction for a window defined by minAge..maxAge minutes ago.
 * Returns the slope-based trend.
 */
function computeTrend(
  history: Array<{ captured_at: string; price: number }>,
  windowMinutes: number,
): TrendDirection {
  const now = Date.now();
  const windowPoints = history.filter(h => {
    const age = (now - new Date(h.captured_at).getTime()) / 60_000;
    return age <= windowMinutes;
  });

  if (windowPoints.length < 3) return 'unknown';

  const prices = windowPoints.map(p => p.price);
  const slope = linearSlope(prices);
  const range = Math.max(...prices) - Math.min(...prices);
  const threshold = range * 0.1; // slope must be > 10% of range to be directional

  if (slope > threshold) return 'bullish';
  if (slope < -threshold) return 'bearish';
  return 'neutral';
}

function computeUnderlyingFeatures(
  snapshot: Awaited<ReturnType<typeof fetchIndexSnapshot>>,
  history: Array<{ captured_at: string; price: number }>,
): UnderlyingFeatures {
  const { price, sessionOpen, sessionHigh, sessionLow, previousClose, timestamp } = snapshot;
  const now = Date.now();

  // Trend
  const trend1m = computeTrend(history, 2);
  const trend5m = computeTrend(history, 5);
  const trend15m = computeTrend(history, 15);

  // Momentum slope using last 15 points
  const recentPrices = history.slice(-15).map(h => h.price);
  const rawSlope = recentPrices.length >= 3 ? linearSlope(recentPrices) : null;
  let momentumLabel: UnderlyingFeatures['momentumLabel'] = 'flat';
  if (rawSlope !== null) {
    if (rawSlope > 5) momentumLabel = 'strong_up';
    else if (rawSlope > 1) momentumLabel = 'weak_up';
    else if (rawSlope < -5) momentumLabel = 'strong_down';
    else if (rawSlope < -1) momentumLabel = 'weak_down';
  }

  // VWAP estimate (time-weighted average since open using stored history)
  const sessionPrices = history.filter(h => {
    // Use all today's points (stored since session)
    return h.price > 0;
  }).map(h => h.price);
  const vwapEstimate = sessionPrices.length > 0
    ? sessionPrices.reduce((a, b) => a + b, 0) / sessionPrices.length
    : null;

  let vwapRelation: UnderlyingFeatures['vwapRelation'] = 'unknown';
  if (vwapEstimate !== null) {
    const diff = price - vwapEstimate;
    if (Math.abs(diff) < 2) vwapRelation = 'at';
    else if (diff > 0) vwapRelation = 'above';
    else vwapRelation = 'below';
  }

  // Opening range (first 30 min of today's history)
  const orPoints = history.filter(h => {
    const age = (now - new Date(h.captured_at).getTime()) / 60_000;
    // Approximate: use the oldest points up to 30 min after earliest
    return true; // all points; will refine with session open
  });

  let openingRangeHigh: number | null = null;
  let openingRangeLow: number | null = null;
  let rangeExpansion: number | null = null;

  if (orPoints.length >= 2) {
    const oldest = new Date(orPoints[0].captured_at).getTime();
    const orWindow = orPoints.filter(h =>
      new Date(h.captured_at).getTime() - oldest <= 30 * 60_000
    );
    if (orWindow.length >= 2) {
      openingRangeHigh = Math.max(...orWindow.map(h => h.price));
      openingRangeLow = Math.min(...orWindow.map(h => h.price));
      const orRange = openingRangeHigh - openingRangeLow;
      const sessionRange = (sessionHigh ?? price) - (sessionLow ?? price);
      rangeExpansion = orRange > 0 ? sessionRange / orRange : null;
    }
  }

  let openingRangePosition: UnderlyingFeatures['openingRangePosition'] = 'unknown';
  if (openingRangeHigh !== null && openingRangeLow !== null) {
    if (price > openingRangeHigh) openingRangePosition = 'above';
    else if (price < openingRangeLow) openingRangePosition = 'below';
    else openingRangePosition = 'inside';
  }

  // Prev day levels
  const prevDayHigh = sessionHigh ?? null;   // Polygon includes prev day via session
  const prevDayLow = sessionLow ?? null;
  let relationToPrevDay: UnderlyingFeatures['relationToPrevDay'] = 'unknown';
  if (previousClose !== null) {
    if (price > (prevDayHigh ?? price) * 1.001) relationToPrevDay = 'above_high';
    else if (price > previousClose) relationToPrevDay = 'above_close';
    else if (price < (prevDayLow ?? price) * 0.999) relationToPrevDay = 'below_low';
    else if (price < previousClose) relationToPrevDay = 'below_close';
    else relationToPrevDay = 'inside_range';
  }

  return {
    price,
    timestamp,
    sessionOpen,
    sessionHigh,
    sessionLow,
    previousClose,
    trend1m,
    trend5m,
    trend15m,
    momentumSlope: rawSlope,
    momentumLabel,
    rangeExpansion,
    openingRangeHigh,
    openingRangeLow,
    openingRangePosition,
    prevDayHigh: null,      // Polygon index snapshot doesn't separate prev vs current daily
    prevDayLow: null,
    relationToPrevDay,
    vwapEstimate,
    vwapRelation,
    distanceToSessionHigh: sessionHigh !== null ? sessionHigh - price : null,
    distanceToSessionLow: sessionLow !== null ? price - sessionLow : null,
    percentFromSessionHigh:
      sessionHigh !== null ? ((sessionHigh - price) / sessionHigh) * 100 : null,
    percentFromSessionLow:
      sessionLow !== null ? ((price - sessionLow) / sessionLow) * 100 : null,
  };
}

// ── OPTIONS CHAIN FEATURE COMPUTATION ────────────────────────────────────────

interface RawChainContract {
  details: { strike_price: number; expiration_date: string; contract_type: 'call' | 'put'; ticker: string };
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  implied_volatility?: number;
  open_interest?: number;
  day?: { volume?: number };
  last_quote?: { bid?: number; ask?: number };
  last_trade?: { price?: number };
}

async function fetchOptionChain(
  underlying: string,
  underlyingPrice: number,
  percentBand = 0.05,
): Promise<RawChainContract[]> {
  const minStrike = (underlyingPrice * (1 - percentBand)).toFixed(0);
  const maxStrike = (underlyingPrice * (1 + percentBand)).toFixed(0);
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + 35 * 86400000).toISOString().split('T')[0];

  const params = new URLSearchParams({
    'strike_price.gte': minStrike,
    'strike_price.lte': maxStrike,
    'expiration_date.gte': today,
    'expiration_date.lte': maxDate,
    limit: '250',
  });

  const data = await polygonFetch(`/v3/snapshot/options/${underlying}?${params.toString()}`);
  return data.results ?? [];
}

function computeChainFeatures(
  contracts: RawChainContract[],
  underlyingPrice: number,
): OptionsChainFeatures {
  if (contracts.length === 0) {
    const atmStrike = Math.round(underlyingPrice / 5) * 5;
    return {
      atmStrike,
      underlierAtCompute: underlyingPrice,
      nearITMStrike: null,
      nearOTMStrike: null,
      highOICallStrike: null,
      highOIPutStrike: null,
      highVolumeCallStrike: null,
      highVolumePutStrike: null,
      highGammaStrike: null,
      callConcentrationZone: null,
      putConcentrationZone: null,
      dteRegime: '0DTE',
      nearestExpiry: new Date().toISOString().split('T')[0],
      is0DTE: true,
      is1DTE: false,
      totalCallOI: 0,
      totalPutOI: 0,
      putCallOIRatio: 1,
      totalCallVolume: 0,
      totalPutVolume: 0,
      putCallVolumeRatio: 1,
    };
  }

  const calls = contracts.filter(c => c.details.contract_type === 'call');
  const puts = contracts.filter(c => c.details.contract_type === 'put');

  // ATM strike
  const allStrikes = [...new Set(contracts.map(c => c.details.strike_price))].sort((a, b) => a - b);
  const atmStrike = allStrikes.reduce((prev, curr) =>
    Math.abs(curr - underlyingPrice) < Math.abs(prev - underlyingPrice) ? curr : prev,
    allStrikes[0] ?? underlyingPrice,
  );

  // Near ITM/OTM
  const callStrikes = calls.map(c => c.details.strike_price).sort((a, b) => a - b);
  const putStrikes = puts.map(c => c.details.strike_price).sort((a, b) => b - a);

  const nearITMStrike = callStrikes.filter(s => s < underlyingPrice).pop() ?? null;
  const nearOTMStrike = callStrikes.find(s => s > underlyingPrice) ?? null;

  // High-OI strikes
  const callsByOI = [...calls].sort((a, b) => (b.open_interest ?? 0) - (a.open_interest ?? 0));
  const putsByOI = [...puts].sort((a, b) => (b.open_interest ?? 0) - (a.open_interest ?? 0));
  const highOICallStrike = callsByOI[0]?.details.strike_price ?? null;
  const highOIPutStrike = putsByOI[0]?.details.strike_price ?? null;

  // High-volume strikes
  const callsByVol = [...calls].sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0));
  const putsByVol = [...puts].sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0));
  const highVolumeCallStrike = callsByVol[0]?.details.strike_price ?? null;
  const highVolumePutStrike = putsByVol[0]?.details.strike_price ?? null;

  // High-gamma strike (combined calls + puts)
  const byGamma = [...contracts].sort(
    (a, b) => (b.greeks?.gamma ?? 0) - (a.greeks?.gamma ?? 0),
  );
  const highGammaStrike = byGamma[0]?.details.strike_price ?? null;

  // Concentration zones: top 5 strikes by OI
  function concentrationZone(
    sorted: RawChainContract[],
  ): { low: number; high: number } | null {
    const top5 = sorted.slice(0, 5).map(c => c.details.strike_price);
    if (top5.length < 2) return null;
    return { low: Math.min(...top5), high: Math.max(...top5) };
  }
  const callConcentrationZone = concentrationZone(callsByOI);
  const putConcentrationZone = concentrationZone(putsByOI);

  // Nearest expiry
  const expiries = [...new Set(contracts.map(c => c.details.expiration_date))].sort();
  const nearestExpiry = expiries[0] ?? new Date().toISOString().split('T')[0];
  const nearestDTE = calculateDTE(nearestExpiry);
  const dteRegime = getDTERegime(nearestDTE);

  // Chain-level totals
  const totalCallOI = calls.reduce((a, c) => a + (c.open_interest ?? 0), 0);
  const totalPutOI = puts.reduce((a, c) => a + (c.open_interest ?? 0), 0);
  const totalCallVolume = calls.reduce((a, c) => a + (c.day?.volume ?? 0), 0);
  const totalPutVolume = puts.reduce((a, c) => a + (c.day?.volume ?? 0), 0);

  return {
    atmStrike,
    underlierAtCompute: underlyingPrice,
    nearITMStrike,
    nearOTMStrike,
    highOICallStrike,
    highOIPutStrike,
    highVolumeCallStrike,
    highVolumePutStrike,
    highGammaStrike,
    callConcentrationZone,
    putConcentrationZone,
    dteRegime,
    nearestExpiry,
    is0DTE: nearestDTE === 0,
    is1DTE: nearestDTE === 1,
    totalCallOI,
    totalPutOI,
    putCallOIRatio: totalCallOI > 0 ? totalPutOI / totalCallOI : 1,
    totalCallVolume,
    totalPutVolume,
    putCallVolumeRatio: totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1,
  };
}

// ── GREEKS FEATURE COMPUTATION ────────────────────────────────────────────────

function computeGreeksFeatures(
  contracts: RawChainContract[],
  underlyingPrice: number,
  prevIV: number | null,
): GreeksFeatures {
  // Find ATM contract (closest strike)
  const atmContract = contracts.reduce<RawChainContract | null>((best, c) => {
    if (!best) return c;
    const dBest = Math.abs(best.details.strike_price - underlyingPrice);
    const dCurr = Math.abs(c.details.strike_price - underlyingPrice);
    return dCurr < dBest ? c : best;
  }, null);

  const atmDelta = atmContract?.greeks?.delta ?? null;
  const atmGamma = atmContract?.greeks?.gamma ?? null;
  const atmTheta = atmContract?.greeks?.theta ?? null;
  const atmVega = atmContract?.greeks?.vega ?? null;
  const atmIV = atmContract?.implied_volatility ?? null;

  const ivChange = (atmIV !== null && prevIV !== null) ? atmIV - prevIV : null;

  // GEX estimate: Σ gamma_i × OI_i × 100 × price²
  // Sign convention: positive = market stabilising
  let gexEstimate = 0;
  for (const c of contracts) {
    const gamma = c.greeks?.gamma ?? 0;
    const oi = c.open_interest ?? 0;
    const multiplier = 100;
    const gex = gamma * oi * multiplier * underlyingPrice * underlyingPrice / 1_000_000;
    // Calls add positive GEX; puts add negative (standard dealer positioning assumption)
    gexEstimate += c.details.contract_type === 'call' ? gex : -gex;
  }

  const gexBias =
    Math.abs(gexEstimate) < 1 ? 'neutral'
    : gexEstimate > 0 ? 'positive'
    : 'negative';

  // IV skew: avg OTM put IV minus avg OTM call IV
  const otmPuts = contracts.filter(
    c => c.details.contract_type === 'put'
      && c.details.strike_price < underlyingPrice
      && c.details.strike_price >= underlyingPrice * 0.99
  );
  const otmCalls = contracts.filter(
    c => c.details.contract_type === 'call'
      && c.details.strike_price > underlyingPrice
      && c.details.strike_price <= underlyingPrice * 1.01
  );

  const avgPutIV = otmPuts.length > 0
    ? otmPuts.reduce((a, c) => a + (c.implied_volatility ?? 0), 0) / otmPuts.length
    : null;
  const avgCallIV = otmCalls.length > 0
    ? otmCalls.reduce((a, c) => a + (c.implied_volatility ?? 0), 0) / otmCalls.length
    : null;

  let ivSkewEstimate: number | null = null;
  let skewBias: GreeksFeatures['skewBias'] = 'unknown';
  if (avgPutIV !== null && avgCallIV !== null) {
    ivSkewEstimate = avgPutIV - avgCallIV;
    if (Math.abs(ivSkewEstimate) < 0.005) skewBias = 'neutral';
    else if (ivSkewEstimate > 0) skewBias = 'put_premium';
    else skewBias = 'call_premium';
  }

  return {
    atmDelta,
    atmGamma,
    atmTheta,
    atmVega,
    atmIV,
    ivChange,
    gexEstimate: Math.round(gexEstimate * 100) / 100,
    gexBias,
    ivSkewEstimate,
    skewBias,
  };
}

// ── FLOW FEATURE COMPUTATION ──────────────────────────────────────────────────

async function computeFlowFeatures(
  supabase: ReturnType<typeof createClient>,
  contracts: RawChainContract[],
): Promise<FlowFeatures> {
  const calls = contracts.filter(c => c.details.contract_type === 'call');
  const puts = contracts.filter(c => c.details.contract_type === 'put');

  const totalCallVol = calls.reduce((a, c) => a + (c.day?.volume ?? 0), 0);
  const totalPutVol = puts.reduce((a, c) => a + (c.day?.volume ?? 0), 0);

  // Load prior 5 wall snapshots to get average volume baseline
  const { data: priorSnaps } = await supabase
    .from('spx_wall_snapshots')
    .select('full_snapshot')
    .order('captured_at', { ascending: false })
    .limit(5);

  let avgCallVolume: number | null = null;
  let avgPutVolume: number | null = null;

  if (priorSnaps && priorSnaps.length >= 2) {
    const callVols = priorSnaps
      .map(s => s.full_snapshot?.callVolume as number | undefined)
      .filter((v): v is number => typeof v === 'number');
    const putVols = priorSnaps
      .map(s => s.full_snapshot?.putVolume as number | undefined)
      .filter((v): v is number => typeof v === 'number');

    if (callVols.length > 0) avgCallVolume = callVols.reduce((a, b) => a + b, 0) / callVols.length;
    if (putVols.length > 0) avgPutVolume = putVols.reduce((a, b) => a + b, 0) / putVols.length;
  }

  const callVolumeBurst = avgCallVolume !== null && totalCallVol > avgCallVolume * 2;
  const putVolumeBurst = avgPutVolume !== null && totalPutVol > avgPutVolume * 2;
  const totalVol = totalCallVol + totalPutVol;
  const avgTotalVol =
    avgCallVolume !== null && avgPutVolume !== null
      ? avgCallVolume + avgPutVolume
      : null;
  const abnormalActivity = avgTotalVol !== null && totalVol > avgTotalVol * 3;

  // Flow bias
  let callPutFlowBias: FlowFeatures['callPutFlowBias'] = 'unknown';
  let biasStrength = 0;
  if (totalVol > 0) {
    const ratio = totalPutVol / totalVol; // 0 = all calls, 1 = all puts
    biasStrength = Math.abs(ratio - 0.5) * 2; // 0-1 scale
    if (biasStrength < 0.15) callPutFlowBias = 'balanced';
    else if (ratio < 0.5) callPutFlowBias = 'call_heavy';
    else callPutFlowBias = 'put_heavy';
  }

  // Sweep-like heuristic: high volume on one side + tight spread
  const topCallByVol = [...calls].sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0))[0];
  const topPutByVol = [...puts].sort((a, b) => (b.day?.volume ?? 0) - (a.day?.volume ?? 0))[0];

  function hasTightSpread(c: RawChainContract): boolean {
    const bid = c.last_quote?.bid ?? 0;
    const ask = c.last_quote?.ask ?? 0;
    const mid = (bid + ask) / 2;
    if (mid === 0) return false;
    return (ask - bid) / mid < 0.05; // < 5% spread
  }

  const callSweepDetected =
    callVolumeBurst &&
    (topCallByVol ? hasTightSpread(topCallByVol) : false);
  const putSweepDetected =
    putVolumeBurst &&
    (topPutByVol ? hasTightSpread(topPutByVol) : false);
  const sweepConfidence =
    (callSweepDetected ? 0.5 : 0) + (putSweepDetected ? 0.5 : 0);

  return {
    callVolumeBurst,
    putVolumeBurst,
    abnormalActivity,
    callPutFlowBias,
    biasStrength,
    callSweepDetected,
    putSweepDetected,
    sweepConfidence,
    avgCallVolume,
    avgPutVolume,
  };
}

// ── EXECUTION FEATURE COMPUTATION ────────────────────────────────────────────

function computeExecutionFeatures(
  contracts: RawChainContract[],
  underlyingPrice: number,
  contractType: 'call' | 'put',
): ExecutionFeatures {
  const sideContracts = contracts.filter(c => c.details.contract_type === contractType);
  const atm = sideContracts.reduce<RawChainContract | null>((best, c) => {
    if (!best) return c;
    return Math.abs(c.details.strike_price - underlyingPrice) <
      Math.abs(best.details.strike_price - underlyingPrice)
      ? c
      : best;
  }, null);

  if (!atm) {
    return {
      bidAskSpread: null,
      spreadPct: null,
      spreadQuality: 'unknown',
      liquidityScore: 0,
      slippageRiskLabel: 'unknown',
      quoteQuality: 'unknown',
    };
  }

  const bid = atm.last_quote?.bid ?? 0;
  const ask = atm.last_quote?.ask ?? 0;
  const mid = (bid + ask) / 2;
  const spread = ask > 0 && bid > 0 ? ask - bid : null;
  const spreadPct = spread !== null && mid > 0 ? (spread / mid) * 100 : null;

  let spreadQuality: ExecutionFeatures['spreadQuality'] = 'unknown';
  if (spreadPct !== null) {
    if (spreadPct < 5) spreadQuality = 'tight';
    else if (spreadPct < 15) spreadQuality = 'normal';
    else if (spreadPct < 30) spreadQuality = 'wide';
    else spreadQuality = 'very_wide';
  }

  const volume = atm.day?.volume ?? 0;
  const oi = atm.open_interest ?? 0;
  const hasQuote = bid > 0 && ask > 0;

  // Liquidity score
  const volScore = clamp(Math.log1p(volume) / Math.log1p(10000) * 100);
  const oiScore = clamp(Math.log1p(oi) / Math.log1p(50000) * 100);
  const spreadScore = spreadPct !== null ? clamp(100 - spreadPct * 2) : 0;
  const quoteScore = hasQuote ? 100 : 0;
  const liquidityScore = clamp(
    volScore * 0.3 + oiScore * 0.25 + spreadScore * 0.3 + quoteScore * 0.15,
  );

  let slippageRiskLabel: ExecutionFeatures['slippageRiskLabel'] = 'unknown';
  if (spreadPct !== null) {
    if (spreadPct < 5) slippageRiskLabel = 'low';
    else if (spreadPct < 15) slippageRiskLabel = 'medium';
    else if (spreadPct < 30) slippageRiskLabel = 'high';
    else slippageRiskLabel = 'very_high';
  }

  let quoteQuality: ExecutionFeatures['quoteQuality'] = 'unknown';
  if (liquidityScore >= 80) quoteQuality = 'excellent';
  else if (liquidityScore >= 60) quoteQuality = 'good';
  else if (liquidityScore >= 40) quoteQuality = 'fair';
  else quoteQuality = 'poor';

  return {
    bidAskSpread: spread,
    spreadPct,
    spreadQuality,
    liquidityScore: Math.round(liquidityScore),
    slippageRiskLabel,
    quoteQuality,
  };
}

// ── MARKET MODE DETECTION ─────────────────────────────────────────────────────

function detectMarketMode(
  sessionType: SessionType,
  trend1m: TrendDirection,
  trend15m: TrendDirection,
  momentumSlope: number | null,
  rangeExpansion: number | null,
): MarketMode {
  if (sessionType === 'pre_market') return 'Pre-Market';
  if (sessionType === 'after_hours') return 'Post-Market';
  if (sessionType === 'weekend') return 'Unknown';

  const slope = momentumSlope ?? 0;
  if (Math.abs(slope) > 10) return 'Shock';

  if (trend1m !== 'unknown' && trend15m !== 'unknown') {
    if (trend1m === trend15m && trend1m !== 'neutral') {
      return Math.abs(slope) > 3 ? 'Expanding' : 'Trending';
    }
    if (trend1m !== trend15m) return 'Ranging';
  }

  if (rangeExpansion !== null) {
    if (rangeExpansion > 1.5) return 'Expanding';
    if (rangeExpansion < 0.8) return 'Compressing';
  }

  return 'Ranging';
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export async function computeSPXFeatures(options?: {
  /** Skip writing price history (use for read-only calls) */
  readonly?: boolean;
}): Promise<SPXFeatures> {
  const warnings: string[] = [];
  const supabase = getServiceRoleClient();

  // 1. Fetch live index snapshot — fall back to last stored price if Polygon is unavailable
  let snapshot: Awaited<ReturnType<typeof fetchIndexSnapshot>>;
  try {
    snapshot = await fetchIndexSnapshot();
  } catch (polygonErr: any) {
    warnings.push(`Polygon snapshot unavailable: ${polygonErr.message}`);
    // Attempt fallback: use the most recent stored price from DB
    const { data: lastPrice } = await supabase
      .from('spx_price_history')
      .select('price, session_open, session_high, session_low, prev_close, captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .single();
    if (!lastPrice?.price) {
      throw new Error(`[FeatureExtractor] Cannot fetch SPX snapshot and no historical price available: ${polygonErr.message}`);
    }
    warnings.push(`Using last stored SPX price: ${lastPrice.price} (from ${lastPrice.captured_at})`);
    snapshot = {
      price:         lastPrice.price,
      sessionOpen:   lastPrice.session_open ?? null,
      sessionHigh:   lastPrice.session_high ?? null,
      sessionLow:    lastPrice.session_low  ?? null,
      previousClose: lastPrice.prev_close   ?? null,
      timestamp:     lastPrice.captured_at  ?? new Date().toISOString(),
    };
  }

  // 2. Store price in history (unless readonly)
  if (!options?.readonly) {
    await storePriceHistory(
      supabase,
      snapshot.price,
      snapshot.sessionOpen,
      snapshot.sessionHigh,
      snapshot.sessionLow,
      snapshot.previousClose,
    );
    // Prune old rows
    await supabase.rpc('purge_spx_price_history', { p_retain_hours: 4 });
  }

  // 3. Load price history (last 60 min)
  const history = await loadRecentHistory(supabase, 60);
  if (history.length < 5) {
    warnings.push('Insufficient price history — trend/momentum metrics may be inaccurate');
  }

  // 4. Fetch options chain (5% band, both directions)
  let chainContracts: RawChainContract[] = [];
  try {
    chainContracts = await fetchOptionChain('SPX', snapshot.price, 0.05);
  } catch (err: any) {
    warnings.push(`Options chain unavailable: ${err.message}`);
  }
  if (chainContracts.length === 0) {
    warnings.push('Empty options chain — chain features degraded');
  }

  // 5. Get previous IV for change detection
  const { data: lastScore } = await supabase
    .from('spx_score_snapshots')
    .select('metadata')
    .order('captured_at', { ascending: false })
    .limit(1)
    .single();
  const prevIV: number | null = lastScore?.metadata?.atmIV ?? null;

  // 6. Compute all feature groups
  const sessionType = getSessionType(new Date());
  const underlying = computeUnderlyingFeatures(snapshot, history);
  const chain = computeChainFeatures(chainContracts, snapshot.price);
  const greeks = computeGreeksFeatures(chainContracts, snapshot.price, prevIV);
  const flow = await computeFlowFeatures(supabase, chainContracts);

  // Dominant direction for execution features: infer from trend
  const dominantDir: 'call' | 'put' =
    underlying.trend5m === 'bullish' || underlying.trend1m === 'bullish' ? 'call' : 'put';
  const execution = computeExecutionFeatures(chainContracts, snapshot.price, dominantDir);

  const marketMode = detectMarketMode(
    sessionType,
    underlying.trend1m,
    underlying.trend15m,
    underlying.momentumSlope,
    underlying.rangeExpansion,
  );

  // 7. Determine data quality
  const dataQuality =
    chainContracts.length > 20 && history.length >= 10 ? 'high'
    : chainContracts.length > 5 || history.length >= 5 ? 'medium'
    : 'low';

  const features: SPXFeatures = {
    computedAt: new Date().toISOString(),
    underlying,
    chain,
    greeks,
    flow,
    execution,
    marketMode,
    sessionType,
    dataQuality,
    warnings,
  };

  return features;
}
