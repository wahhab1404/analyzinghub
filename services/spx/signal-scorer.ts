/**
 * services/spx/signal-scorer.ts
 *
 * Phase 2 — Signal Scoring Engine
 *
 * Combines all sub-scores from Features, Walls, and Shock into a weighted
 * composite signal and selects the appropriate SignalType + SignalMode.
 *
 * COMPOSITE SCORE FORMULA (documented)
 * ──────────────────────────────────────
 *   compositeScore =
 *     0.20 × structure_score     (trend/range quality)
 *   + 0.20 × flow_score          (options flow)
 *   + 0.15 × gamma_score         (gamma environment)
 *   + 0.15 × wall_score          (wall context)
 *   + 0.10 × iv_score            (IV environment)
 *   + 0.10 × execution_score     (spread/liquidity)
 *   + 0.05 × time_context_score  (session quality)
 *   + 0.05 × contract_fit_score  (best contract fit)
 *
 * CONFIDENCE CLASS MAPPING
 * ──────────────────────────
 *   A: ≥ 80
 *   B: ≥ 65
 *   C: ≥ 50
 *   D: ≥ 35
 *   E: < 35
 *
 * SIGNAL TYPE SELECTION LOGIC (documented)
 * ─────────────────────────────────────────
 * 1. If shock > 70: → SHOCK_WARNING
 * 2. If wall migration + near wall: → WALL_SHIFT_WARNING
 * 3. If call sweep OR put sweep + abnormal: → FLOW_SURGE_WARNING
 * 4. If composite < 40: → NO_TRADE (not enough conviction)
 * 5. If composite 40-55 + bullish: → WATCH_CALL
 * 6. If composite 40-55 + bearish: → WATCH_PUT
 * 7. If composite ≥ 55 + bullish: → BUY_CALL
 * 8. If composite ≥ 55 + bearish: → BUY_PUT
 * 9. If neutral: → MARKET_UNCLEAR
 *
 * SIGNAL MODE SELECTION
 * ──────────────────────
 * Based on combination of: market mode, shock state, wall state, trend alignment.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type {
  SignalOutput,
  SignalSubScores,
  SignalType,
  SignalMode,
  ConfidenceClass,
  DirectionBias,
  SPXFeatures,
  WallEngineOutput,
  ShockEngineOutput,
} from './types';

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── SUB-SCORE COMPUTATION ─────────────────────────────────────────────────────

/**
 * Structure score: quality of trend/range structure.
 * High when: trend aligned across timeframes, momentum consistent.
 */
function computeStructureScore(features: SPXFeatures): number {
  let score = 50; // neutral baseline

  const { trend1m, trend5m, trend15m, momentumSlope, momentumLabel, rangeExpansion } =
    features.underlying;

  // Trend alignment: 1m, 5m, 15m all pointing same direction
  const trends = [trend1m, trend5m, trend15m].filter(t => t !== 'unknown');
  const aligned = trends.every(t => t === trends[0]) && trends[0] !== 'neutral';
  if (aligned && trends.length === 3) score += 25;
  else if (aligned && trends.length === 2) score += 15;

  // Momentum reinforces direction
  if (momentumLabel === 'strong_up' || momentumLabel === 'strong_down') score += 15;
  else if (momentumLabel === 'weak_up' || momentumLabel === 'weak_down') score += 5;

  // Range expansion bonus
  if (rangeExpansion !== null && rangeExpansion > 1.2) score += 10;

  // Conflicting trends penalise
  if (trend1m !== 'unknown' && trend5m !== 'unknown' && trend1m !== trend5m) score -= 20;

  return clamp(score);
}

/**
 * Flow score: quality and directionality of options flow.
 * High when: volume burst on dominant side + sweep detected + clear bias.
 */
function computeFlowScore(features: SPXFeatures, directionBias: DirectionBias): number {
  let score = 30; // below neutral baseline (flow needs to be confirmed)

  const { callVolumeBurst, putVolumeBurst, abnormalActivity, callPutFlowBias, biasStrength,
    callSweepDetected, putSweepDetected } = features.flow;

  // Flow aligned with direction
  if (directionBias === 'bullish' && callPutFlowBias === 'call_heavy') {
    score += 30 + biasStrength * 20;
  } else if (directionBias === 'bearish' && callPutFlowBias === 'put_heavy') {
    score += 30 + biasStrength * 20;
  } else if (callPutFlowBias === 'balanced') {
    score += 10;
  } else {
    score -= 10; // flow contradicts direction
  }

  // Volume bursts
  if (directionBias === 'bullish' && callVolumeBurst) score += 15;
  if (directionBias === 'bearish' && putVolumeBurst) score += 15;
  if (abnormalActivity) score += 10;

  // Sweep-like activity
  if (directionBias === 'bullish' && callSweepDetected) score += 15;
  if (directionBias === 'bearish' && putSweepDetected) score += 15;

  return clamp(score);
}

/**
 * Gamma score: favourability of the gamma environment.
 * High when: low IV (cheaper options), positive GEX (stabilising), moderate theta.
 */
function computeGammaScore(features: SPXFeatures, directionBias: DirectionBias): number {
  let score = 50;

  const { atmGamma, atmIV, gexBias, atmTheta } = features.greeks;

  // GEX environment
  if (gexBias === 'positive') score += 15;     // stabilising → stops trending (good for options selling)
  if (gexBias === 'negative') score -= 5;       // destabilising → good for directional gamma plays

  // IV level: lower IV = cheaper options, better R/R
  if (atmIV !== null) {
    if (atmIV < 0.15) score += 20;             // very low IV
    else if (atmIV < 0.20) score += 10;
    else if (atmIV > 0.30) score -= 15;        // high IV = expensive options
    else if (atmIV > 0.25) score -= 5;
  }

  // ATM gamma: higher gamma near expiry = faster repricing (good for 0DTE scalps)
  if (atmGamma !== null && features.chain.is0DTE) {
    score += Math.min(20, atmGamma * 5000);
  }

  // Theta burn context: high theta on 0DTE hurts long option holders
  if (atmTheta !== null && features.chain.is0DTE && atmTheta < -0.5) {
    score -= 10;  // time decay risk on 0DTE
  }

  return clamp(score);
}

/**
 * Wall score: clarity and usefulness of wall context.
 * High when: walls are clearly defined, price has clear path to target.
 */
function computeWallScore(
  features: SPXFeatures,
  walls: WallEngineOutput,
  directionBias: DirectionBias,
): number {
  let score = walls.wallScore; // start with wall engine's own aggregate

  // Clear walls boost confidence
  if (walls.callWall && walls.putWall) score += 10;

  // Wall alignment with direction
  if (directionBias === 'bullish') {
    // Good: put wall below as support
    if (walls.putWall && walls.putWall.distanceFromPrice < 30) score += 15;
    // Bad: call wall very close = near resistance
    if (walls.callWall && walls.callWall.distanceFromPrice < 10) score -= 15;
    // Very good: call wall being approached and rejected previously = potential breakout
    if (walls.callWall?.state === 'rejected') score += 10;
    if (walls.callWall?.state === 'broken') score += 20;
  } else if (directionBias === 'bearish') {
    if (walls.callWall && walls.callWall.distanceFromPrice < 30) score += 15;
    if (walls.putWall && walls.putWall.distanceFromPrice < 10) score -= 15;
    if (walls.putWall?.state === 'rejected') score += 10;
    if (walls.putWall?.state === 'broken') score += 20;
  }

  // Compression = uncertain → penalise
  if (walls.wallCompression && walls.wallCompressionWidth && walls.wallCompressionWidth < 20) {
    score -= 20;
  }

  return clamp(score);
}

/**
 * IV score: how favourable the IV environment is for buying options.
 * Low IV = cheaper premium → higher score.
 */
function computeIVScore(features: SPXFeatures): number {
  const atmIV = features.greeks.atmIV;
  if (atmIV === null) return 50;

  // IV percentile not available (no history); use absolute level heuristic
  // SPX typical IV: 10-15% = very low, 15-20% = low, 20-25% = normal, 25-35% = elevated
  if (atmIV < 0.12) return 90;
  if (atmIV < 0.15) return 80;
  if (atmIV < 0.18) return 70;
  if (atmIV < 0.22) return 60;
  if (atmIV < 0.26) return 45;
  if (atmIV < 0.30) return 30;
  return 15;
}

/**
 * Execution score: spread/liquidity quality.
 */
function computeExecutionScore(features: SPXFeatures): number {
  return features.execution.liquidityScore;
}

/**
 * Time context score: session quality for options trading.
 * Best during core hours 9:45–11:30 and 13:00–15:00 ET.
 */
function computeTimeContextScore(features: SPXFeatures): number {
  const { sessionType } = features;
  if (sessionType === 'pre_market' || sessionType === 'after_hours') return 10;
  if (sessionType === 'weekend') return 0;

  // Approximate ET hour from UTC
  const etHour = (new Date().getUTCHours() - 5 + 24) % 24;
  const etMin = new Date().getUTCMinutes();
  const etTime = etHour + etMin / 60;

  if (etTime >= 9.75 && etTime < 11.5) return 90;  // Best: morning drive
  if (etTime >= 13.0 && etTime < 15.0) return 80;  // Good: afternoon
  if (etTime >= 11.5 && etTime < 13.0) return 50;  // Lunch: choppy
  if (etTime >= 9.5 && etTime < 9.75) return 70;   // Open: volatile but tradeable
  if (etTime >= 15.0 && etTime < 15.5) return 60;  // MOC run
  if (etTime >= 15.5 && etTime < 16.0) return 30;  // Last 30 min: erratic
  return 20;
}

/**
 * Contract fit score: placeholder pre-ranking (updated by contract ranker).
 * Uses chain/execution data to estimate fit before full ranking.
 */
function computeContractFitScore(features: SPXFeatures, directionBias: DirectionBias): number {
  let score = 50;

  // 0DTE score uplift if it's a momentum/shock play
  if (features.chain.is0DTE) score += 10;

  // Liquidity near ATM
  if (features.execution.liquidityScore > 70) score += 20;
  if (features.execution.spreadQuality === 'tight') score += 15;
  if (features.execution.spreadQuality === 'very_wide') score -= 30;

  // Suitable chain data present
  if (features.chain.nearOTMStrike !== null) score += 5;

  return clamp(score);
}

// ── DIRECTION BIAS COMPUTATION ────────────────────────────────────────────────

function computeDirectionBias(
  features: SPXFeatures,
  shock: ShockEngineOutput,
): DirectionBias {
  const { trend1m, trend5m, trend15m, momentumLabel } = features.underlying;
  const { callPutFlowBias } = features.flow;

  // Count votes
  let bullVotes = 0;
  let bearVotes = 0;

  const trendVotes: Record<string, number> = { bullish: 0, bearish: 0, neutral: 0, unknown: 0 };
  [trend1m, trend5m, trend15m].forEach(t => trendVotes[t]++);

  bullVotes += trendVotes.bullish * 2;
  bearVotes += trendVotes.bearish * 2;

  if (momentumLabel === 'strong_up' || momentumLabel === 'weak_up') bullVotes += 1;
  if (momentumLabel === 'strong_down' || momentumLabel === 'weak_down') bearVotes += 1;

  if (callPutFlowBias === 'call_heavy') bullVotes += 2;
  if (callPutFlowBias === 'put_heavy') bearVotes += 2;

  if (shock.velocity1m !== null) {
    if (shock.priceVelocity1m !== null && shock.priceVelocity1m > 0) bullVotes += 1;
    if (shock.priceVelocity1m !== null && shock.priceVelocity1m < 0) bearVotes += 1;
  }

  if (bullVotes > bearVotes + 2) return 'bullish';
  if (bearVotes > bullVotes + 2) return 'bearish';
  return 'neutral';
}

// ── SIGNAL MODE SELECTION ─────────────────────────────────────────────────────

function selectSignalMode(
  features: SPXFeatures,
  walls: WallEngineOutput,
  shock: ShockEngineOutput,
  directionBias: DirectionBias,
): SignalMode {
  const { marketMode } = features;
  const { compositeShockScore } = shock;

  // Shock override
  if (compositeShockScore > 70) return 'Momentum_Shock';

  // Wall-based modes
  if (walls.callWall?.state === 'broken' && directionBias === 'bullish') {
    return 'Wall_Break_Continuation';
  }
  if (walls.putWall?.state === 'broken' && directionBias === 'bearish') {
    return 'Wall_Break_Continuation';
  }
  if (walls.callWall?.state === 'rejected' && directionBias === 'bearish') {
    return 'Wall_Rejection';
  }
  if (walls.putWall?.state === 'rejected' && directionBias === 'bullish') {
    return 'Wall_Rejection';
  }

  // Market mode mappings
  if (marketMode === 'Expanding') {
    const trendAligned =
      features.underlying.trend1m === features.underlying.trend15m &&
      features.underlying.trend1m !== 'neutral';
    if (trendAligned) return directionBias === 'bullish' ? 'Breakout' : 'Breakdown';
    return 'Flow_Expansion';
  }

  if (marketMode === 'Trending') {
    if (compositeShockScore > 40) return 'Trend_Acceleration';
    return 'Trend';
  }

  if (marketMode === 'Ranging' || marketMode === 'Compressing') {
    // In ranging market, trade reversals not trends
    return directionBias === 'neutral' ? 'Mean_Reversion' : 'Reversal';
  }

  if (marketMode === 'Shock') return 'Momentum_Shock';
  if (marketMode === 'Recovery') return 'Liquidity_Sweep_Recovery';

  if (features.flow.abnormalActivity) return 'Flow_Expansion';

  return 'Trend';
}

// ── SIGNAL TYPE SELECTION ─────────────────────────────────────────────────────

function selectSignalType(
  compositeScore: number,
  directionBias: DirectionBias,
  shock: ShockEngineOutput,
  walls: WallEngineOutput,
  features: SPXFeatures,
): SignalType {
  // Warning signals take priority over trade signals

  // 1. Shock warning
  if (shock.compositeShockScore > 70) return 'SHOCK_WARNING';

  // 2. Wall shift warning
  if (walls.wallMigration) return 'WALL_SHIFT_WARNING';

  // 3. Flow surge
  if (features.flow.abnormalActivity && shock.compositeShockScore > 50) {
    return 'FLOW_SURGE_WARNING';
  }

  // 4. Reversal watch: exhaustion signal high
  if (shock.exhaustionSignal > 75) return 'REVERSAL_WATCH';

  // 5. Session gating
  if (features.sessionType === 'pre_market' || features.sessionType === 'after_hours') {
    return 'NO_TRADE';
  }

  // 6. Score-based classification
  if (compositeScore < 40) return 'NO_TRADE';

  if (directionBias === 'neutral') return 'MARKET_UNCLEAR';

  if (compositeScore >= 55) {
    return directionBias === 'bullish' ? 'BUY_CALL' : 'BUY_PUT';
  }

  // 40-55 range = WATCH
  return directionBias === 'bullish' ? 'WATCH_CALL' : 'WATCH_PUT';
}

// ── RATIONALE GENERATION ──────────────────────────────────────────────────────

function buildRationale(
  signalType: SignalType,
  signalMode: SignalMode,
  directionBias: DirectionBias,
  features: SPXFeatures,
  walls: WallEngineOutput,
  shock: ShockEngineOutput,
  subScores: SignalSubScores,
): { rationale: string; keyFactors: string[]; risks: string[] } {
  const keyFactors: string[] = [];
  const risks: string[] = [];

  // Direction
  if (features.underlying.trend1m === features.underlying.trend5m) {
    keyFactors.push(
      `${features.underlying.trend1m} trend aligned on 1m and 5m`,
    );
  }

  // Flow
  if (features.flow.callPutFlowBias !== 'unknown' && features.flow.callPutFlowBias !== 'balanced') {
    keyFactors.push(
      `${features.flow.callPutFlowBias.replace('_', ' ')} flow bias (strength: ${(features.flow.biasStrength * 100).toFixed(0)}%)`,
    );
  }

  // Walls
  if (walls.putWall && directionBias === 'bullish') {
    keyFactors.push(`Put wall at ${walls.putWall.strike} (strength ${walls.putWall.strength.toFixed(0)}) acting as support`);
  }
  if (walls.callWall && directionBias === 'bearish') {
    keyFactors.push(`Call wall at ${walls.callWall.strike} (strength ${walls.callWall.strength.toFixed(0)}) acting as resistance`);
  }

  // Shock
  if (shock.compositeShockScore > 30) {
    keyFactors.push(`Shock composite ${shock.compositeShockScore} (${shock.severityLabel})`);
  }

  // Risks
  if (features.execution.spreadQuality === 'wide' || features.execution.spreadQuality === 'very_wide') {
    risks.push('Wide bid-ask spread increases fill risk');
  }
  if (walls.wallCompression) {
    risks.push(`Price compressed between walls (${walls.wallCompressionWidth?.toFixed(0)} pts range)`);
  }
  if (features.chain.is0DTE) {
    risks.push('0DTE: Rapid time decay and high intraday reversal risk');
  }
  if (shock.exhaustionSignal > 50) {
    risks.push(`Possible exhaustion (signal: ${shock.exhaustionSignal})`);
  }

  const rationale =
    `${signalType} | ${signalMode} | Composite ${Math.round(subScores.structure * 0.2 + subScores.flow * 0.2)}pt structure+flow. ` +
    `${directionBias.toUpperCase()} bias with ${keyFactors.slice(0, 2).join('; ')}.`;

  return { rationale, keyFactors, risks };
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export async function computeSignal(
  features: SPXFeatures,
  walls: WallEngineOutput,
  shock: ShockEngineOutput,
): Promise<SignalOutput> {
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  // 1. Direction bias
  const directionBias = computeDirectionBias(features, shock);

  // 2. Sub-scores
  const structure = computeStructureScore(features);
  const flow = computeFlowScore(features, directionBias);
  const gamma = computeGammaScore(features, directionBias);
  const wall = computeWallScore(features, walls, directionBias);
  const iv = computeIVScore(features);
  const execution = computeExecutionScore(features);
  const timeContext = computeTimeContextScore(features);
  const contractFit = computeContractFitScore(features, directionBias);

  const subScores: SignalSubScores = {
    structure,
    flow,
    gamma,
    wall,
    iv,
    execution,
    timeContext,
    contractFit,
  };

  // 3. Composite score
  const compositeScore = clamp(
    0.20 * structure +
    0.20 * flow +
    0.15 * gamma +
    0.15 * wall +
    0.10 * iv +
    0.10 * execution +
    0.05 * timeContext +
    0.05 * contractFit,
  );

  // 4. Confidence class
  const confidenceClass: ConfidenceClass =
    compositeScore >= 80 ? 'A'
    : compositeScore >= 65 ? 'B'
    : compositeScore >= 50 ? 'C'
    : compositeScore >= 35 ? 'D'
    : 'E';

  // 5. Signal type and mode
  const signalType = selectSignalType(compositeScore, directionBias, shock, walls, features);
  const signalMode = selectSignalMode(features, walls, shock, directionBias);

  // 6. Recommended contract parameters
  let recommendedContractType: 'call' | 'put' | null = null;
  let recommendedStrike: number | null = null;
  let recommendedExpiry: string | null = null;

  if (signalType === 'BUY_CALL' || signalType === 'WATCH_CALL') {
    recommendedContractType = 'call';
    recommendedStrike = features.chain.nearOTMStrike ?? features.chain.atmStrike;
    recommendedExpiry = features.chain.nearestExpiry;
  } else if (signalType === 'BUY_PUT' || signalType === 'WATCH_PUT') {
    recommendedContractType = 'put';
    // For puts, nearOTM is below price
    const putOTM = features.chain.nearITMStrike
      ? features.chain.atmStrike - (features.chain.nearITMStrike - features.chain.atmStrike)
      : features.chain.atmStrike;
    recommendedStrike = putOTM;
    recommendedExpiry = features.chain.nearestExpiry;
  }

  // 7. Rationale
  const { rationale, keyFactors, risks } = buildRationale(
    signalType, signalMode, directionBias, features, walls, shock, subScores,
  );

  // 8. Expiry (signal validity: 15 min for 0DTE, 30 min otherwise)
  const expiryMinutes = features.chain.is0DTE ? 15 : 30;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

  const signalId = randomUUID();

  const signal: SignalOutput = {
    id: signalId,
    generatedAt: now,
    underlyingPrice: features.underlying.price,
    signalType,
    signalMode,
    directionBias,
    marketMode: features.marketMode,
    compositeScore: Math.round(compositeScore),
    confidenceClass,
    subScores: {
      structure: Math.round(structure),
      flow: Math.round(flow),
      gamma: Math.round(gamma),
      wall: Math.round(wall),
      iv: Math.round(iv),
      execution: Math.round(execution),
      timeContext: Math.round(timeContext),
      contractFit: Math.round(contractFit),
    },
    rationale,
    keyFactors,
    risks,
    recommendedStrike,
    recommendedExpiry,
    recommendedContractType,
    targetPremium: null,  // filled by contract ranker
    expiresAt,
  };

  // 9. Persist to DB
  const { error: sigErr } = await supabase
    .from('spx_signal_events')
    .insert({
      id: signalId,
      signal_type: signalType,
      signal_mode: signalMode,
      direction_bias: directionBias,
      market_mode: features.marketMode,
      underlying_price: features.underlying.price,
      composite_score: Math.round(compositeScore),
      confidence_class: confidenceClass,
      recommended_strike: recommendedStrike,
      recommended_expiry: recommendedExpiry,
      recommended_option_type: recommendedContractType,
      sub_scores: subScores,
      context_snapshot: { features, walls: { computedAt: walls.computedAt, wallScore: walls.wallScore }, shock: { compositeShockScore: shock.compositeShockScore } },
      rationale,
      key_factors: keyFactors,
      risks,
      expires_at: expiresAt,
    });
  if (sigErr) console.error('[SignalScorer] DB insert failed:', sigErr.message);

  // 10. Persist score snapshot
  const { error: snapErr } = await supabase
    .from('spx_score_snapshots')
    .insert({
      underlying_price: features.underlying.price,
      composite_score: Math.round(compositeScore),
      confidence_class: confidenceClass,
      direction_bias: directionBias,
      market_mode: features.marketMode,
      structure_score: Math.round(structure),
      flow_score: Math.round(flow),
      gamma_score: Math.round(gamma),
      wall_score: Math.round(wall),
      iv_score: Math.round(iv),
      execution_score: Math.round(execution),
      time_context_score: Math.round(timeContext),
      contract_fit_score: Math.round(contractFit),
      shock_score: shock.shockScore,
      acceleration_score: shock.accelerationScore,
      metadata: { atmIV: features.greeks.atmIV },
    });
  if (snapErr) console.error('[SignalScorer] Score snapshot insert failed:', snapErr.message);

  return signal;
}
