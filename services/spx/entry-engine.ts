/**
 * services/spx/entry-engine.ts
 *
 * Phase 3 — SPX Entry Plan Computation
 *
 * Computes a complete entry/stop/target plan for a confirmed SPX options trade.
 * This module is pure (no DB calls) — it takes structured inputs from the
 * intelligence engine and returns an EntryPlan that the trade engine then
 * persists to spx_trades.
 *
 * Called when a trade transitions from 'candidate' → 'confirmed'.
 *
 * Entry zone:        mid price ± small buffer
 * Hard stop SPX:     derived from wall levels or distance-based fallback
 * Soft stop labels:  condition-based human-readable invalidation strings
 * Stop premium:      DTE-tiered loss threshold as a premium level
 * Targets:           signal-confidence-adjusted premium multiples from entry
 * Time stop:         expiry-relative cutoff timestamp
 * Rationale:         1-sentence human-readable summary
 */

import type {
  SignalOutput,
  SPXFeatures,
  WallEngineOutput,
  ShockEngineOutput,
} from './types';

// ── EXPORTED TYPES ────────────────────────────────────────────────────────────

export interface EntryPlan {
  // Entry zone
  /** Lower bound of the acceptable entry premium range. */
  suggestedEntryLow: number;
  /** Upper bound of the acceptable entry premium range. */
  suggestedEntryHigh: number;

  // Invalidation
  /** Underlying SPX price level — if breached, the trade thesis is dead. */
  hardStopSpx: number;
  /** Human-readable soft invalidation conditions (e.g. wall break, IV collapse). */
  softStopConditions: string[];

  // Premium-based risk management
  /** Premium level at which to exit for a loss (DTE-tiered). */
  stopPremium: number;

  // Profit targets (all premium levels, not %)
  /** First profit target premium. */
  target1Premium: number;
  /** Second profit target premium. */
  target2Premium: number;
  /** Third profit target premium. */
  target3Premium: number;
  /** Runner target — hold a small position for maximum potential. */
  runnerPremium: number;

  // Time stop
  /** ISO timestamp — forcibly exit by this time if still open. */
  timeStopAt: string;

  // Notes
  /** One-sentence rationale summarising the trade setup. */
  rationale: string;
}

// ── CONTRACT INPUT ─────────────────────────────────────────────────────────────

export interface EntryContractInput {
  mid: number;
  strike: number;
  optionType: 'call' | 'put';
  dte: number;
  spread: number;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Build the hard stop SPX level from wall context.
 *
 * For calls: use the put wall strike − 5 if available and below price,
 * otherwise fall back to price − (price × bps).
 *
 * For puts: use the call wall strike + 5 if available and above price,
 * otherwise fall back to price + (price × bps).
 *
 * 0DTE uses a tighter 30 bps fallback (0.003); other DTE use 50 bps (0.005).
 */
function computeHardStopSpx(
  optionType: 'call' | 'put',
  dte: number,
  underlyingPrice: number,
  walls: WallEngineOutput,
): number {
  const is0DTE = dte === 0;
  const fallbackBps = is0DTE ? 0.003 : 0.005;

  if (optionType === 'call') {
    const putWall = walls.putWall;
    if (putWall && putWall.strike < underlyingPrice) {
      return putWall.strike - 5;
    }
    return underlyingPrice - underlyingPrice * fallbackBps;
  } else {
    const callWall = walls.callWall;
    if (callWall && callWall.strike > underlyingPrice) {
      return callWall.strike + 5;
    }
    return underlyingPrice + underlyingPrice * fallbackBps;
  }
}

/**
 * Build the list of soft stop condition labels.
 *
 * Soft stops are non-price conditions that indicate the trade thesis has
 * been invalidated.  They do not trigger automatic exits but should prompt
 * the trader to reassess.
 */
function buildSoftStopConditions(
  optionType: 'call' | 'put',
  features: SPXFeatures,
  shock: ShockEngineOutput,
): string[] {
  const conditions: string[] = [];

  if (optionType === 'call') {
    conditions.push('Price breaks below VWAP on volume');
    conditions.push('Call wall strike breaks on high OI close');
  } else {
    conditions.push('Price breaks above VWAP on volume');
    conditions.push('Put wall strikes holds as support');
  }

  // IV collapse condition — only add when ATM IV is available
  if (features.greeks.atmIV !== null) {
    conditions.push('IV drops >25% from entry IV');
  }

  // Volume dry-up condition
  conditions.push('Volume dries up below 50% of chain average');

  // Shock reversal — only relevant when a shock signal is present
  const isShockSignal =
    shock.severity !== 'none' && shock.compositeShockScore >= 40;
  if (isShockSignal) {
    conditions.push('Shock reversal — momentum direction flips');
  }

  return conditions;
}

/**
 * Compute the stop premium level based on DTE regime.
 *
 * - 0DTE:   mid × 0.60  (40% maximum loss — tighter due to gamma risk)
 * - 1DTE:   mid × 0.65  (35% maximum loss)
 * - Weekly: mid × 0.70  (30% maximum loss — more room for intraday noise)
 */
function computeStopPremium(mid: number, dte: number): number {
  if (dte === 0) return mid * 0.60;
  if (dte === 1) return mid * 0.65;
  return mid * 0.70;   // weekly (2-5 DTE)
}

/**
 * Target premium multipliers keyed by confidence class.
 *
 * For shock signal modes (Momentum_Shock, Trend_Acceleration), all target
 * multipliers receive a 20% additive bonus.
 */
interface TargetMultipliers {
  t1: number;
  t2: number;
  t3: number;
  runner: number;
}

function getTargetMultipliers(
  confidenceClass: string,
  signalMode: string,
): TargetMultipliers {
  let base: TargetMultipliers;

  switch (confidenceClass) {
    case 'A':
      base = { t1: 1.45, t2: 2.00, t3: 2.75, runner: 4.00 };
      break;
    case 'B':
      base = { t1: 1.35, t2: 1.75, t3: 2.40, runner: 3.50 };
      break;
    default:
      // C, D, E — more conservative targets
      base = { t1: 1.25, t2: 1.55, t3: 2.00, runner: 2.75 };
  }

  // Boost targets for high-momentum signal modes
  const isShockMode =
    signalMode === 'Momentum_Shock' || signalMode === 'Trend_Acceleration';
  if (isShockMode) {
    const boost = 0.20;
    return {
      t1: base.t1 + boost,
      t2: base.t2 + boost,
      t3: base.t3 + boost,
      runner: base.runner + boost,
    };
  }

  return base;
}

/**
 * Compute the time stop timestamp.
 *
 * - 0DTE:   19:30 UTC on the expiry day (= 2:30 pm US/Eastern / 90 min before 4pm close)
 *           We use 19:30 UTC which corresponds to 2:30 PM ET (UTC-5) / 3:30 PM EDT (UTC-4).
 *           For safety we target 19:30 UTC as the 0DTE cutoff.
 * - 1DTE:   Next calendar day at 18:00 UTC (1:00 PM ET)
 * - Weekly: 2 trading days before expiry at 17:00 UTC (12:00 PM ET)
 *
 * All timestamps are returned as ISO strings.
 */
function computeTimeStop(dte: number, expiry: string): string {
  const expiryDate = new Date(expiry + 'T00:00:00Z');

  if (dte === 0) {
    // Same day — 19:30 UTC (2:30 PM ET) on expiry date
    const stop = new Date(expiryDate);
    stop.setUTCHours(19, 30, 0, 0);
    return stop.toISOString();
  }

  if (dte === 1) {
    // Next calendar day at 18:00 UTC (1:00 PM ET)
    const stop = new Date(expiryDate);
    stop.setUTCHours(18, 0, 0, 0);
    return stop.toISOString();
  }

  // Weekly / 2+ DTE — 2 trading days before expiry at 17:00 UTC (12:00 PM ET)
  // We approximate 2 calendar days as 2 trading days for simplicity.
  const stop = new Date(expiryDate);
  stop.setUTCDate(stop.getUTCDate() - 2);
  stop.setUTCHours(17, 0, 0, 0);
  return stop.toISOString();
}

/**
 * Format a dollar amount cleanly for rationale strings.
 */
function formatPremium(p: number): string {
  return `$${p.toFixed(2)}`;
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────

/**
 * Compute a complete entry plan for a confirmed SPX trade.
 *
 * This is a pure, synchronous computation — no DB calls are made.
 * The caller (trade engine orchestrator) is responsible for persisting
 * the resulting plan to the spx_trades row.
 *
 * @param signal    The SignalOutput that triggered the trade.
 * @param features  The full SPXFeatures snapshot at confirmation time.
 * @param contract  Key contract data: mid price, strike, type, DTE, spread.
 * @param walls     The most recent WallEngineOutput.
 * @param shock     The most recent ShockEngineOutput.
 * @returns A fully computed EntryPlan ready to persist.
 */
export function computeEntryPlan(
  signal: SignalOutput,
  features: SPXFeatures,
  contract: EntryContractInput,
  walls: WallEngineOutput,
  shock: ShockEngineOutput,
): EntryPlan {
  const { mid, optionType, dte } = contract;
  const underlyingPrice = signal.underlyingPrice;

  // ── ENTRY ZONE ────────────────────────────────────────────────────────────
  // A tight ±3% band around the current mid price.
  // The lower bound represents the ideal limit entry; the upper bound is the
  // maximum acceptable fill to maintain positive risk/reward.
  const suggestedEntryLow  = mid * 0.97;
  const suggestedEntryHigh = mid * 1.03;

  // ── HARD STOP SPX ────────────────────────────────────────────────────────
  const hardStopSpx = computeHardStopSpx(optionType, dte, underlyingPrice, walls);

  // ── SOFT STOP CONDITIONS ─────────────────────────────────────────────────
  const softStopConditions = buildSoftStopConditions(optionType, features, shock);

  // ── STOP PREMIUM ─────────────────────────────────────────────────────────
  const stopPremium = computeStopPremium(mid, dte);

  // ── PROFIT TARGETS ───────────────────────────────────────────────────────
  const mults = getTargetMultipliers(signal.confidenceClass, signal.signalMode);
  const target1Premium = mid * mults.t1;
  const target2Premium = mid * mults.t2;
  const target3Premium = mid * mults.t3;
  const runnerPremium  = mid * mults.runner;

  // ── TIME STOP ─────────────────────────────────────────────────────────────
  // Use recommended expiry from signal, falling back to today as 0DTE.
  const expiryStr = signal.recommendedExpiry
    ?? new Date().toISOString().substring(0, 10);
  const timeStopAt = computeTimeStop(dte, expiryStr);

  // ── RATIONALE ────────────────────────────────────────────────────────────
  const directionVerb = optionType === 'call' ? 'BUY_CALL' : 'BUY_PUT';
  const rationale =
    `${directionVerb} on ${signal.signalMode} signal ` +
    `(score ${signal.compositeScore.toFixed(0)}, ${signal.confidenceClass} confidence): ` +
    `entry ${formatPremium(suggestedEntryLow)}–${formatPremium(suggestedEntryHigh)}, ` +
    `stop at ${formatPremium(stopPremium)} or SPX ${hardStopSpx.toFixed(0)}, ` +
    `targets ${formatPremium(target1Premium)}/${formatPremium(target2Premium)}/${formatPremium(target3Premium)}`;

  return {
    suggestedEntryLow,
    suggestedEntryHigh,
    hardStopSpx,
    softStopConditions,
    stopPremium,
    target1Premium,
    target2Premium,
    target3Premium,
    runnerPremium,
    timeStopAt,
    rationale,
  };
}
