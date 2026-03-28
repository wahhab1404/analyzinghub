/**
 * services/spx/exit-engine.ts
 *
 * Phase 3 — SPX Exit Signal Engine
 *
 * Evaluates all monitored trades against current market conditions and emits
 * ExitSignal objects when exit or stop conditions are triggered.
 *
 * Exit conditions evaluated (in priority order):
 *   1. STOP HIT           — premium ≤ stopPremium (immediate)
 *   2. HARD STOP SPX      — underlying breaches hardStopSpx (immediate)
 *   3. TIME_DECAY_EXIT    — trade.timeStopAt has passed (immediate)
 *   4. WALL_FAILURE_EXIT  — wall supporting the trade has broken (immediate)
 *   5. VOLATILITY_EXIT    — ATM IV has collapsed significantly (advisory)
 *   6. MOMENTUM_FAILURE   — trend has reversed against trade direction (next_candle)
 *   7. TRAIL_STOP_UPDATE  — target hit → suggest trailing stop adjustment (advisory)
 *
 * checkExitConditions() only acts on trades in entered/active/partially_exited.
 * persistExitSignal() writes to spx_exit_events for logging and deduplication.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  SPXFeatures,
  WallEngineOutput,
  ShockEngineOutput,
} from './types';
import type { SPXTrade } from './trade-engine';

// ── CLIENT ────────────────────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── EXPORTED TYPES ────────────────────────────────────────────────────────────

export type ExitSignalType =
  | 'EXIT_CALL'
  | 'EXIT_PUT'
  | 'REDUCE_POSITION'
  | 'TRAIL_STOP_UPDATE'
  | 'WALL_FAILURE_EXIT'
  | 'TIME_DECAY_EXIT'
  | 'VOLATILITY_EXIT'
  | 'MOMENTUM_FAILURE_EXIT';

export interface ExitSignal {
  /** The exit action type. */
  type: ExitSignalType;
  /** UUID of the trade this signal applies to. */
  tradeId: string;
  /** Human-readable description of why this exit is recommended. */
  reason: string;
  /**
   * How urgently the exit should be acted on:
   *   immediate    — exit now; price risk is acute
   *   next_candle  — exit on the next OHLCV candle close
   *   advisory     — informational; trader discretion
   */
  urgency: 'immediate' | 'next_candle' | 'advisory';
  /** Suggested exit premium (null when the level cannot be estimated). */
  suggestedExitPremium: number | null;
  /** SPX underlying price at the moment this signal was generated. */
  spxPriceAtSignal: number;
  /** Which specific conditions fired to produce this signal. */
  triggeredBy: string[];
}

// ── STATES ELIGIBLE FOR EXIT EVALUATION ──────────────────────────────────────

const MONITORED_STATES = new Set(['entered', 'active', 'partially_exited']);

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Determine the appropriate EXIT_ type based on the trade's option type.
 *
 * For a call trade we emit EXIT_CALL; for a put trade EXIT_PUT.
 * Falls back to EXIT_CALL when optionType is null (should not occur in practice).
 */
function exitTypeForTrade(trade: SPXTrade): 'EXIT_CALL' | 'EXIT_PUT' {
  return trade.optionType === 'put' ? 'EXIT_PUT' : 'EXIT_CALL';
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────────

/**
 * Evaluate all exit conditions for a single trade against the current market
 * snapshot and return any triggered exit signals.
 *
 * The function is additive — multiple signals can be returned in a single call
 * (e.g. a TRAIL_STOP_UPDATE advisory alongside a WALL_FAILURE_EXIT).
 *
 * Only trades in states 'entered', 'active', or 'partially_exited' are
 * evaluated.  All other states return an empty array immediately.
 *
 * @param trade     The SPXTrade to evaluate.
 * @param features  Current SPXFeatures snapshot from the intelligence engine.
 * @param walls     Current WallEngineOutput.
 * @param shock     Current ShockEngineOutput.
 * @returns Array of ExitSignal objects (may be empty).
 */
export async function checkExitConditions(
  trade: SPXTrade,
  features: SPXFeatures,
  walls: WallEngineOutput,
  shock: ShockEngineOutput,
): Promise<ExitSignal[]> {
  // Only monitor trades that have been entered
  if (!MONITORED_STATES.has(trade.state)) {
    return [];
  }

  const signals: ExitSignal[] = [];
  const now = new Date();
  const spxPrice = features.underlying.price;

  // ── 1. STOP HIT ───────────────────────────────────────────────────────────
  // Hard rule: if current premium has fallen to or below the stop premium,
  // exit immediately to cap the loss.
  if (
    trade.stopPremium !== null &&
    trade.currentPremium !== null &&
    trade.currentPremium <= trade.stopPremium
  ) {
    signals.push({
      type: exitTypeForTrade(trade),
      tradeId: trade.id,
      reason: `Stop premium hit: current ${trade.currentPremium.toFixed(4)} ≤ stop ${trade.stopPremium.toFixed(4)}`,
      urgency: 'immediate',
      suggestedExitPremium: trade.currentPremium,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['stop_premium_hit'],
    });
  }

  // ── 2. HARD STOP SPX ─────────────────────────────────────────────────────
  // If SPX underlying price has crossed the hard stop level, the trade's
  // directional thesis is invalidated — exit regardless of premium.
  if (trade.hardStopSpx !== null) {
    if (trade.optionType === 'call' && spxPrice < trade.hardStopSpx) {
      signals.push({
        type: 'EXIT_CALL',
        tradeId: trade.id,
        reason: `Hard stop SPX breached: price ${spxPrice.toFixed(2)} < hard stop ${trade.hardStopSpx.toFixed(2)}`,
        urgency: 'immediate',
        suggestedExitPremium: trade.currentPremium,
        spxPriceAtSignal: spxPrice,
        triggeredBy: ['hard_stop_spx_breached'],
      });
    } else if (trade.optionType === 'put' && spxPrice > trade.hardStopSpx) {
      signals.push({
        type: 'EXIT_PUT',
        tradeId: trade.id,
        reason: `Hard stop SPX breached: price ${spxPrice.toFixed(2)} > hard stop ${trade.hardStopSpx.toFixed(2)}`,
        urgency: 'immediate',
        suggestedExitPremium: trade.currentPremium,
        spxPriceAtSignal: spxPrice,
        triggeredBy: ['hard_stop_spx_breached'],
      });
    }
  }

  // ── 3. TIME DECAY EXIT ────────────────────────────────────────────────────
  // Theta burn becomes severe close to expiry.  If the time stop has passed,
  // exit immediately to avoid holding into accelerating decay.
  if (trade.timeStopAt !== null) {
    const timeStop = new Date(trade.timeStopAt);
    if (now >= timeStop) {
      signals.push({
        type: exitTypeForTrade(trade),
        tradeId: trade.id,
        reason: `Time stop reached: ${trade.timeStopAt} — theta decay risk now acute`,
        urgency: 'immediate',
        suggestedExitPremium: trade.currentPremium,
        spxPriceAtSignal: spxPrice,
        triggeredBy: ['time_stop_reached'],
      });
    }
  }

  // ── 4. WALL FAILURE EXIT ──────────────────────────────────────────────────
  // When the primary wall that was supporting the trade's directional thesis
  // has been broken through, the wall-based setup is invalidated.
  if (trade.optionType === 'call' && walls.callWall?.state === 'broken') {
    signals.push({
      type: 'WALL_FAILURE_EXIT',
      tradeId: trade.id,
      reason: `Call wall at ${walls.callWall.strike} has broken — bullish resistance context invalidated`,
      urgency: 'immediate',
      suggestedExitPremium: trade.currentPremium,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['call_wall_broken'],
    });
  } else if (trade.optionType === 'put' && walls.putWall?.state === 'broken') {
    signals.push({
      type: 'WALL_FAILURE_EXIT',
      tradeId: trade.id,
      reason: `Put wall at ${walls.putWall.strike} has broken — bearish support context invalidated`,
      urgency: 'immediate',
      suggestedExitPremium: trade.currentPremium,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['put_wall_broken'],
    });
  }

  // ── 5. VOLATILITY EXIT ────────────────────────────────────────────────────
  // A significant IV collapse erodes the option's extrinsic value faster than
  // directional gains can compensate.  Only fire when we have ATM IV data and
  // the trade metadata carries the IV at entry.
  if (features.greeks.atmIV !== null && trade.metadata) {
    const entryIV = typeof trade.metadata.entryAtmIV === 'number'
      ? trade.metadata.entryAtmIV as number
      : null;
    if (entryIV !== null && entryIV > 0) {
      const ivDropPct = ((entryIV - features.greeks.atmIV) / entryIV) * 100;
      if (ivDropPct > 30) {
        signals.push({
          type: 'VOLATILITY_EXIT',
          tradeId: trade.id,
          reason: `ATM IV has dropped ${ivDropPct.toFixed(1)}% from entry IV ${entryIV.toFixed(2)} → ${features.greeks.atmIV.toFixed(2)} — extrinsic value collapsing`,
          urgency: 'advisory',
          suggestedExitPremium: trade.currentPremium,
          spxPriceAtSignal: spxPrice,
          triggeredBy: ['iv_collapse_gt_30pct'],
        });
      }
    }
  }

  // ── 6. MOMENTUM FAILURE EXIT ─────────────────────────────────────────────
  // When trend on both the 1-minute and 5-minute timeframes has turned against
  // the trade direction AND the momentum slope is sharply negative (for calls)
  // or positive (for puts), the momentum setup has failed.
  const trend1m = features.underlying.trend1m;
  const trend5m = features.underlying.trend5m;
  const momentumSlope = features.underlying.momentumSlope ?? 0;

  if (
    trade.optionType === 'call' &&
    trend1m === 'bearish' &&
    trend5m === 'bearish' &&
    momentumSlope < -1
  ) {
    signals.push({
      type: 'MOMENTUM_FAILURE_EXIT',
      tradeId: trade.id,
      reason: `Call trade momentum failure: 1m ${trend1m}, 5m ${trend5m}, slope ${momentumSlope.toFixed(2)} pts/min`,
      urgency: 'next_candle',
      suggestedExitPremium: trade.currentPremium,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['trend_1m_bearish', 'trend_5m_bearish', 'momentum_slope_negative'],
    });
  } else if (
    trade.optionType === 'put' &&
    trend1m === 'bullish' &&
    trend5m === 'bullish' &&
    momentumSlope > 1
  ) {
    signals.push({
      type: 'MOMENTUM_FAILURE_EXIT',
      tradeId: trade.id,
      reason: `Put trade momentum failure: 1m ${trend1m}, 5m ${trend5m}, slope +${momentumSlope.toFixed(2)} pts/min`,
      urgency: 'next_candle',
      suggestedExitPremium: trade.currentPremium,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['trend_1m_bullish', 'trend_5m_bullish', 'momentum_slope_positive'],
    });
  }

  // ── 7. TRAIL STOP UPDATE (ADVISORY) ─────────────────────────────────────
  // When a profit target is reached, advise adjusting the trailing stop to
  // lock in gains.  This is informational — not a hard exit signal.
  //
  // T1 hit → trail stop to breakeven (entry premium)
  // T2 hit → trail stop to T1 premium
  if (
    trade.currentPremium !== null &&
    trade.target2Premium !== null &&
    trade.target1Premium !== null &&
    trade.currentPremium >= trade.target2Premium
  ) {
    signals.push({
      type: 'TRAIL_STOP_UPDATE',
      tradeId: trade.id,
      reason: `Target 2 hit at ${trade.currentPremium.toFixed(4)} — trail stop up to T1 (${trade.target1Premium.toFixed(4)}) to protect gains`,
      urgency: 'advisory',
      suggestedExitPremium: null,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['target_2_hit'],
    });
  } else if (
    trade.currentPremium !== null &&
    trade.target1Premium !== null &&
    trade.entryPremium !== null &&
    trade.currentPremium >= trade.target1Premium
  ) {
    signals.push({
      type: 'TRAIL_STOP_UPDATE',
      tradeId: trade.id,
      reason: `Target 1 hit at ${trade.currentPremium.toFixed(4)} — trail stop to breakeven (entry ${trade.entryPremium.toFixed(4)}) to protect capital`,
      urgency: 'advisory',
      suggestedExitPremium: null,
      spxPriceAtSignal: spxPrice,
      triggeredBy: ['target_1_hit'],
    });
  }

  return signals;
}

/**
 * Persist an exit signal to the spx_exit_events table.
 *
 * Called after checkExitConditions() to create an immutable log entry.
 * Callers should call this once per signal, not once per trade cycle, to
 * avoid duplicating advisory entries on every run.
 *
 * @param signal           The ExitSignal to persist.
 * @param contractPremium  The contract premium at the time of persistence
 *                         (may differ slightly from suggestedExitPremium
 *                          if a few seconds have elapsed).  Pass null when
 *                          the current premium is not available.
 */
export async function persistExitSignal(
  signal: ExitSignal,
  contractPremium: number | null,
): Promise<void> {
  const supabase = getServiceRoleClient();

  const { error } = await supabase
    .from('spx_exit_events')
    .insert({
      trade_id: signal.tradeId,
      exit_type: signal.type,
      spx_price: signal.spxPriceAtSignal,
      contract_premium: contractPremium,
      reason: signal.reason,
      metadata: {
        urgency: signal.urgency,
        suggestedExitPremium: signal.suggestedExitPremium,
        triggeredBy: signal.triggeredBy,
      },
    });

  if (error) {
    console.error(
      `[ExitEngine] persistExitSignal(${signal.type} for trade ${signal.tradeId}) failed:`,
      error.message,
    );
  }
}
