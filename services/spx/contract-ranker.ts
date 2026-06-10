/**
 * services/spx/contract-ranker.ts
 *
 * Phase 2 — Contract Selection & Ranking Engine
 *
 * Fetches the options chain, applies filters, scores each candidate,
 * and returns best / backup / aggressive / conservative selections.
 *
 * RANKING FORMULA (documented)
 * ─────────────────────────────
 * rankScore = 0.35 × liquidity_score + 0.30 × responsiveness_score + 0.35 × fit_score
 *
 * liquidity_score (0-100):
 *   0.30 × vol_score     (log-normalised day volume)
 * + 0.25 × oi_score      (log-normalised open interest)
 * + 0.30 × spread_score  (100 − spread_pct × 2, clamped)
 * + 0.15 × quote_score   (100 if bid > 0 AND ask > 0, else 0)
 *
 * responsiveness_score (0-100):
 *   Derived from |delta| × (1 / spread_pct_normalised).
 *   Higher delta + tighter spread = premium moves more per unit SPX move
 *   with less slippage cost.
 *
 * fit_score (0-100):
 *   Base = 50. Adjustments:
 *   +20 if DTE regime matches signal expiryPreference
 *   +15 if |delta| in preferred range [minDelta, maxDelta]
 *   +10 if premium in preferred range [minPremium, maxPremium]
 *   +5  if OI > 1000
 *
 * RANK LABEL ASSIGNMENT
 * ──────────────────────
 * Candidates are sorted by rankScore descending.
 * best:         rankScore #1 — highest overall
 * backup:       rankScore #2 — second best (often more liquid / tighter spread)
 * aggressive:   highest |delta| among remaining (furthest OTM with acceptable liquidity)
 * conservative: lowest |delta| among remaining (closest to ATM/ITM)
 */

import { createClient } from '@supabase/supabase-js';
import type {
  ContractRankingConfig,
  ContractRankingOutput,
  RankedContract,
  ContractRankLabel,
  DTERegime,
} from './types';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function polygonFetch(path: string): Promise<any> {
  if (!POLYGON_API_KEY) throw new Error('POLYGON_API_KEY not configured');
  // `path` may be a relative API path or a fully-qualified next_url returned by
  // Polygon's pagination. Only prepend the base URL for relative paths.
  const base = path.startsWith('http') ? path : `${POLYGON_BASE_URL}${path}`;
  const url = base.includes('apiKey=')
    ? base
    : `${base}${base.includes('?') ? '&' : '?'}apiKey=${POLYGON_API_KEY}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${POLYGON_API_KEY}` },
        next: { revalidate: 0 },
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      if (!res.ok) throw new Error(`Polygon ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
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

// ── CHAIN FETCH ───────────────────────────────────────────────────────────────

interface RawContract {
  details: {
    ticker: string;
    strike_price: number;
    expiration_date: string;
    contract_type: 'call' | 'put';
  };
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
  implied_volatility?: number;
  open_interest?: number;
  day?: { volume?: number };
  last_quote?: { bid?: number; ask?: number };
  last_trade?: { price?: number };
}

async function fetchChainForRanking(config: ContractRankingConfig): Promise<RawContract[]> {
  const { underlyingPrice, contractType, expiryPreference } = config;

  // Determine date range
  let minDTE = config.minDTE ?? 0;
  let maxDTE = config.maxDTE ?? 7;

  if (expiryPreference === '0DTE') { minDTE = 0; maxDTE = 0; }
  else if (expiryPreference === '1DTE') { minDTE = 0; maxDTE = 1; }
  else if (expiryPreference === 'weekly') { minDTE = 0; maxDTE = 7; }
  else { maxDTE = config.maxDTE ?? 35; }

  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + minDTE);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + maxDTE);

  // Strike band — how far from ATM to scan strikes for both calls & puts.
  // Widened so the engine also considers FARTHER OTM (and deeper ITM) strikes;
  // the delta / liquidity / spread filters downstream still trim the set, so a
  // wider net just gives those filters more candidates to choose from.
  // Caller may override via config.strikeBandPct.
  const bandPct = config.strikeBandPct ?? 0.30;
  const minStrike = (underlyingPrice * (1 - bandPct)).toFixed(0);
  const maxStrike = (underlyingPrice * (1 + bandPct)).toFixed(0);

  const params = new URLSearchParams({
    contract_type: contractType,
    'strike_price.gte': minStrike,
    'strike_price.lte': maxStrike,
    'expiration_date.gte': minDate.toISOString().split('T')[0],
    'expiration_date.lte': maxDate.toISOString().split('T')[0],
    order: 'asc',
    sort: 'strike_price',
    limit: '250',
  });

  const underlying = config.underlying.replace(/^I:/, '');

  // Paginate across the (now wider) strike band. A single 250-row page can be
  // exhausted before reaching the farther OTM strikes, which would silently
  // truncate exactly the contracts we widened the band to capture. Follow
  // next_url up to a safe cap so calls AND puts both see their far strikes.
  const MAX_PAGES = 6;
  const all: RawContract[] = [];
  let next: string | null = `/v3/snapshot/options/${underlying}?${params.toString()}`;
  for (let page = 0; page < MAX_PAGES && next; page++) {
    const data = await polygonFetch(next);
    if (Array.isArray(data?.results)) all.push(...data.results);
    next = data?.next_url ?? null;
  }
  return all;
}

// ── SCORING ───────────────────────────────────────────────────────────────────

function computeLiquidityScore(
  volume: number,
  oi: number,
  spreadPct: number,
  hasBothSides: boolean,
): number {
  const volScore = clamp(Math.log1p(volume) / Math.log1p(10000) * 100);
  const oiScore = clamp(Math.log1p(oi) / Math.log1p(50000) * 100);
  const spreadScore = clamp(100 - spreadPct * 2);
  const quoteScore = hasBothSides ? 100 : 0;

  return clamp(volScore * 0.30 + oiScore * 0.25 + spreadScore * 0.30 + quoteScore * 0.15);
}

function computeResponsivenessScore(
  delta: number | null,
  spreadPct: number,
): number {
  if (delta === null) return 0;
  const absDelta = Math.abs(delta);
  // Normalise spread: spreadPct 0-5% = 1.0, 5-15% = 0.7, 15-30% = 0.4, 30%+ = 0.1
  const spreadFactor =
    spreadPct < 5 ? 1.0
    : spreadPct < 15 ? 0.7
    : spreadPct < 30 ? 0.4
    : 0.1;

  return clamp(absDelta * 150 * spreadFactor);
}

function computeFitScore(
  dte: number,
  delta: number | null,
  premium: number,
  oi: number,
  config: ContractRankingConfig,
): number {
  let score = 50;

  const regime = getDTERegime(dte);
  const prefMap: Record<string, DTERegime> = {
    '0DTE': '0DTE', '1DTE': '1DTE', weekly: 'Weekly', any: regime,
  };
  if (regime === prefMap[config.expiryPreference]) score += 20;

  if (delta !== null) {
    const absDelta = Math.abs(delta);
    const minD = config.minDelta ?? 0.15;
    const maxD = config.maxDelta ?? 0.60;
    if (absDelta >= minD && absDelta <= maxD) score += 15;
  }

  const minP = config.minPremium ?? 0;
  const maxP = config.maxPremium ?? 50;
  if (premium >= minP && premium <= maxP) score += 10;

  if (oi > 1000) score += 5;

  return clamp(score);
}

// ── SLIPPAGE LABEL ────────────────────────────────────────────────────────────

function getSlippageLabel(spreadPct: number): RankedContract['slippageRiskLabel'] {
  if (spreadPct < 5) return 'low';
  if (spreadPct < 15) return 'medium';
  if (spreadPct < 30) return 'high';
  return 'very_high';
}

// ── RANK LABEL ASSIGNMENT ─────────────────────────────────────────────────────

function assignRankLabels(candidates: RankedContract[]): RankedContract[] {
  if (candidates.length === 0) return [];

  // Sort by rankScore descending
  const sorted = [...candidates].sort((a, b) => b.rankScore - a.rankScore);

  const labelled: RankedContract[] = [];
  const usedLabels = new Set<ContractRankLabel>();

  // best: #1 overall
  if (sorted[0]) {
    labelled.push({ ...sorted[0], rankLabel: 'best' });
    usedLabels.add('best');
  }

  // backup: #2 overall (or most liquid if different from best)
  const backupIdx = sorted.findIndex((_, i) => i > 0);
  if (backupIdx !== -1 && sorted[backupIdx]) {
    labelled.push({ ...sorted[backupIdx], rankLabel: 'backup' });
    usedLabels.add('backup');
  }

  // aggressive: highest |delta| among remaining (furthest OTM)
  const remaining = sorted.filter((_, i) => i > 1);
  const aggressive = remaining.reduce<RankedContract | null>((best, c) => {
    const bd = Math.abs(best?.delta ?? 0);
    const cd = Math.abs(c.delta ?? 0);
    // For calls, higher delta = closer to ATM (less aggressive); for aggressive we want *lower* delta (further OTM)
    // Actually for aggressive we want HIGHER delta in a different sense: further OTM = smaller delta
    // "Aggressive" in trading = higher leverage = further OTM = smaller delta
    return cd < bd ? c : best;
  }, remaining[0] ?? null);
  if (aggressive) {
    labelled.push({ ...aggressive, rankLabel: 'aggressive' });
    usedLabels.add('aggressive');
  }

  // conservative: closest to ATM / highest |delta| (closest to 0.50)
  const conservative = remaining.reduce<RankedContract | null>((best, c) => {
    if (c === aggressive) return best;
    const bd = Math.abs((best?.delta ?? 0) - 0.5);
    const cd = Math.abs((c.delta ?? 0) - 0.5);
    return cd < bd ? c : best;
  }, remaining.find(r => r !== aggressive) ?? null);
  if (conservative && conservative !== aggressive) {
    labelled.push({ ...conservative, rankLabel: 'conservative' });
  }

  return labelled;
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export async function rankContracts(
  config: ContractRankingConfig,
): Promise<ContractRankingOutput> {
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  const filterSummary = {
    totalChainContracts: 0,
    afterExpiryFilter: 0,
    afterDeltaFilter: 0,
    afterLiquidityFilter: 0,
    afterSpreadFilter: 0,
    finalCandidates: 0,
  };

  // 1. Fetch chain
  let rawContracts: RawContract[] = [];
  try {
    rawContracts = await fetchChainForRanking(config);
  } catch (err: any) {
    console.error('[ContractRanker] Chain fetch failed:', err.message);
    return {
      generatedAt: now,
      signalId: config.signalId ?? null,
      underlyingPrice: config.underlyingPrice,
      contractType: config.contractType,
      best: null,
      backup: null,
      aggressive: null,
      conservative: null,
      allCandidates: [],
      filterSummary,
    };
  }

  filterSummary.totalChainContracts = rawContracts.length;

  // 2. Build candidate list with pricing
  const candidates: RankedContract[] = rawContracts.map(c => {
    const bid = c.last_quote?.bid ?? 0;
    const ask = c.last_quote?.ask ?? 0;
    const last = c.last_trade?.price ?? null;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last ?? 0;
    const spread = bid > 0 && ask > 0 ? ask - bid : 0;
    const spreadPct = mid > 0 ? (spread / mid) * 100 : 100;
    const dte = calculateDTE(c.details.expiration_date);
    const dteRegime = getDTERegime(dte);
    const delta = c.greeks?.delta ?? null;
    const volume = c.day?.volume ?? 0;
    const oi = c.open_interest ?? 0;

    const liquidityScore = computeLiquidityScore(volume, oi, spreadPct, bid > 0 && ask > 0);
    const responsivenessScore = computeResponsivenessScore(delta, spreadPct);
    const fitScore = computeFitScore(dte, delta, mid, oi, config);
    const rankScore = clamp(
      0.35 * liquidityScore + 0.30 * responsivenessScore + 0.35 * fitScore,
    );

    const absDelta = delta !== null ? Math.abs(delta) : 0;
    const estimatedLeverage = absDelta > 0 && mid > 0 ? mid / absDelta : null;

    return {
      ticker: c.details.ticker,
      strike: c.details.strike_price,
      expiry: c.details.expiration_date,
      optionType: config.contractType,
      dte,
      dteRegime,
      bid,
      ask,
      mid,
      last,
      spreadPct: Math.round(spreadPct * 100) / 100,
      volume,
      openInterest: oi,
      delta,
      gamma: c.greeks?.gamma ?? null,
      theta: c.greeks?.theta ?? null,
      vega: c.greeks?.vega ?? null,
      iv: c.implied_volatility ?? null,
      liquidityScore: Math.round(liquidityScore),
      responsivenessScore: Math.round(responsivenessScore),
      fitScore: Math.round(fitScore),
      rankScore: Math.round(rankScore),
      rankLabel: 'best' as ContractRankLabel, // will be overwritten
      estimatedLeverage,
      slippageRiskLabel: getSlippageLabel(spreadPct),
    };
  });

  // 3. Apply filters
  let filtered = candidates;

  // Expiry filter (already applied in fetch, but re-validate)
  filtered = filtered.filter(c => c.dte >= (config.minDTE ?? 0) && c.dte <= (config.maxDTE ?? 35));
  filterSummary.afterExpiryFilter = filtered.length;

  // Delta filter
  const minD = config.minDelta ?? 0.10;
  const maxD = config.maxDelta ?? 0.70;
  filtered = filtered.filter(c =>
    c.delta === null || (Math.abs(c.delta) >= minD && Math.abs(c.delta) <= maxD),
  );
  filterSummary.afterDeltaFilter = filtered.length;

  // Liquidity filter
  const minLiq = config.minLiquidityScore ?? 15;
  filtered = filtered.filter(c => c.liquidityScore >= minLiq);
  filterSummary.afterLiquidityFilter = filtered.length;

  // Spread filter
  const maxSpread = config.maxSpreadPct ?? 50;
  filtered = filtered.filter(c => c.spreadPct <= maxSpread);
  filterSummary.afterSpreadFilter = filtered.length;

  // Premium filter
  if (config.minPremium !== undefined) {
    filtered = filtered.filter(c => c.mid >= (config.minPremium!));
  }
  if (config.maxPremium !== undefined) {
    filtered = filtered.filter(c => c.mid <= (config.maxPremium!));
  }

  // Min OI / Volume
  if (config.minOI !== undefined) {
    filtered = filtered.filter(c => c.openInterest >= config.minOI!);
  }
  if (config.minVolume !== undefined) {
    filtered = filtered.filter(c => c.volume >= config.minVolume!);
  }

  filterSummary.finalCandidates = filtered.length;

  if (filtered.length === 0) {
    return {
      generatedAt: now,
      signalId: config.signalId ?? null,
      underlyingPrice: config.underlyingPrice,
      contractType: config.contractType,
      best: null,
      backup: null,
      aggressive: null,
      conservative: null,
      allCandidates: [],
      filterSummary,
    };
  }

  // 4. Assign rank labels
  const ranked = assignRankLabels(filtered);

  const best = ranked.find(r => r.rankLabel === 'best') ?? null;
  const backup = ranked.find(r => r.rankLabel === 'backup') ?? null;
  const aggressive = ranked.find(r => r.rankLabel === 'aggressive') ?? null;
  const conservative = ranked.find(r => r.rankLabel === 'conservative') ?? null;

  // 5. Persist to DB
  const dbRows = ranked.map(r => ({
    signal_event_id: config.signalId ?? null,
    ticker: r.ticker,
    strike: r.strike,
    expiry: r.expiry,
    option_type: r.optionType,
    dte: r.dte,
    dte_regime: r.dteRegime,
    bid: r.bid,
    ask: r.ask,
    mid: r.mid,
    last_price: r.last,
    spread_pct: r.spreadPct,
    volume: r.volume,
    open_interest: r.openInterest,
    delta: r.delta,
    gamma: r.gamma,
    theta: r.theta,
    vega: r.vega,
    iv: r.iv,
    liquidity_score: r.liquidityScore,
    responsiveness_score: r.responsivenessScore,
    fit_score: r.fitScore,
    rank_score: r.rankScore,
    rank_label: r.rankLabel,
    estimated_leverage: r.estimatedLeverage,
    slippage_risk_label: r.slippageRiskLabel,
    metadata: { underlyingPrice: config.underlyingPrice },
  }));

  const { error: dbErr } = await supabase.from('spx_contract_candidates').insert(dbRows);
  if (dbErr) console.error('[ContractRanker] DB insert failed:', dbErr.message);

  return {
    generatedAt: now,
    signalId: config.signalId ?? null,
    underlyingPrice: config.underlyingPrice,
    contractType: config.contractType,
    best,
    backup,
    aggressive,
    conservative,
    allCandidates: ranked,
    filterSummary,
  };
}
