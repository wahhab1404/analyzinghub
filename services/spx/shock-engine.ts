/**
 * services/spx/shock-engine.ts
 *
 * Phase 2 — Shock / Acceleration Engine
 *
 * Detects unusual directional pressure, sudden repricing, and flow bursts
 * by combining price velocity metrics (from stored history) with options
 * flow data (from the latest WallEngineOutput).
 *
 * SCORE FORMULAS (documented)
 * ───────────────────────────
 *
 * shockScore = clamp(
 *   0.35 × price_velocity_score   (how fast price is moving vs. typical)
 * + 0.30 × sudden_repricing_score (sudden jump vs. rolling std dev)
 * + 0.20 × flow_burst_score       (from FlowFeatures.callVolumeBurst / putVolumeBurst)
 * + 0.15 × gamma_accel_score      (high gamma + fast move = accelerating repricing)
 * )
 *
 * accelerationScore = clamp(
 *   |velocity_1m - velocity_5m| / max(|velocity_5m|, 0.1) × 100
 * )
 * — This measures how much the 1m velocity deviates from the 5m baseline.
 *
 * compositeShockScore = 0.6 × shockScore + 0.4 × accelerationScore
 *
 * continuationProbability:
 *   Base = 0.50. Adjusted by:
 *   +0.15 if trend1m === trend5m (aligned)
 *   +0.10 if flowBurst on same side
 *   +0.10 if gamma negative (destabilising, amplifies)
 *   -0.20 if exhaustionSignal > 70 (overextended)
 *   Clamped 0.05–0.95.
 *
 * reversalProbability = 1 − continuationProbability after adjustments.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  ShockEngineOutput,
  ShockSeverity,
  SPXFeatures,
  WallEngineOutput,
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

function clampProb(v: number): number {
  return Math.max(0.05, Math.min(0.95, v));
}

// ── PRICE VELOCITY COMPUTATION ────────────────────────────────────────────────

async function fetchPriceHistory(
  minutes: number,
): Promise<Array<{ captured_at: string; price: number }>> {
  const supabase = getServiceRoleClient();
  const { data } = await supabase
    .from('spx_price_history')
    .select('captured_at, price')
    .gte('captured_at', new Date(Date.now() - minutes * 60_000).toISOString())
    .order('captured_at', { ascending: true });
  return data ?? [];
}

/**
 * Compute price velocity (points per minute) for a window.
 * Uses start-to-end slope of the window.
 */
function computeVelocity(
  history: Array<{ captured_at: string; price: number }>,
  windowMinutes: number,
): number | null {
  const now = Date.now();
  const window = history.filter(
    h => (now - new Date(h.captured_at).getTime()) / 60_000 <= windowMinutes,
  );
  if (window.length < 2) return null;

  const first = window[0];
  const last = window[window.length - 1];
  const elapsedMin =
    (new Date(last.captured_at).getTime() - new Date(first.captured_at).getTime()) / 60_000;
  if (elapsedMin === 0) return null;

  return (last.price - first.price) / elapsedMin;
}

/**
 * Compute rolling standard deviation of price changes.
 * Used to normalise "sudden repricing" against typical volatility.
 */
function computeRollingStdDev(prices: number[]): number {
  if (prices.length < 2) return 1;
  const diffs = prices.slice(1).map((p, i) => p - prices[i]);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length;
  return Math.sqrt(variance) || 1;
}

// ── SCORE COMPONENTS ──────────────────────────────────────────────────────────

function computePriceVelocityScore(velocity1m: number | null): number {
  if (velocity1m === null) return 0;
  // SPX typical 1m range ≈ 2-5 pts. Shock threshold ≈ 10+ pts/min.
  const absV = Math.abs(velocity1m);
  if (absV < 1) return 0;
  if (absV < 3) return 20;
  if (absV < 5) return 40;
  if (absV < 8) return 60;
  if (absV < 12) return 80;
  return 100;
}

function computeSuddenRepricingScore(
  prices: number[],
  currentPrice: number,
): number {
  if (prices.length < 5) return 0;
  const stdDev = computeRollingStdDev(prices.slice(-20));
  const lastMove =
    prices.length >= 2
      ? Math.abs(currentPrice - prices[prices.length - 2])
      : 0;
  const zScore = lastMove / stdDev;
  // 3σ move = 90, 2σ = 60, 1σ = 30
  return clamp(zScore * 30);
}

function computeFlowBurstScore(
  callBurst: boolean,
  putBurst: boolean,
  abnormal: boolean,
  sweepConfidence: number,
): number {
  let score = 0;
  if (callBurst || putBurst) score += 40;
  if (abnormal) score += 30;
  score += sweepConfidence * 30;
  return clamp(score);
}

function computeGammaAccelScore(
  gexBias: string,
  velocity1m: number | null,
  atmGamma: number | null,
): number {
  if (velocity1m === null || atmGamma === null) return 0;
  const absV = Math.abs(velocity1m);
  // Negative GEX + fast move = gamma amplification → higher score
  const gexFactor = gexBias === 'negative' ? 1.5 : gexBias === 'positive' ? 0.5 : 1.0;
  // High gamma + fast move
  const gammaMagnitude = Math.min(1, atmGamma * 100);  // normalize (typical SPX gamma ~0.001)
  return clamp(absV * gammaMagnitude * gexFactor * 20);
}

function computeExhaustionSignal(
  velocity1m: number | null,
  velocity5m: number | null,
  history: Array<{ price: number }>,
  currentPrice: number,
): number {
  if (velocity1m === null || velocity5m === null) return 0;

  // Exhaustion heuristic:
  // 1. Velocity is decelerating (1m much slower than 5m in same direction)
  // 2. Price has moved > 1.5% in the 5m window
  const prices = history.map(h => h.price);
  const priceRange5m = Math.max(...prices.slice(-10)) - Math.min(...prices.slice(-10));
  const pctMove = (priceRange5m / currentPrice) * 100;

  const decel = velocity5m !== 0
    ? 1 - Math.abs(velocity1m) / (Math.abs(velocity5m) + 0.001)
    : 0;
  const decelClamped = Math.max(0, decel);

  if (pctMove > 1.5 && decelClamped > 0.5) return clamp(pctMove * 20 + decelClamped * 40);
  return 0;
}

function getSeverity(compositeScore: number): { severity: ShockSeverity; label: string } {
  if (compositeScore >= 80) return { severity: 'extreme', label: 'Extreme Shock' };
  if (compositeScore >= 60) return { severity: 'severe', label: 'Severe Shock' };
  if (compositeScore >= 40) return { severity: 'moderate', label: 'Moderate Shock' };
  if (compositeScore >= 20) return { severity: 'mild', label: 'Mild Acceleration' };
  return { severity: 'none', label: 'Normal' };
}

function detectPatterns(
  shockScore: number,
  accelerationScore: number,
  features: SPXFeatures,
  walls: WallEngineOutput,
): string[] {
  const patterns: string[] = [];

  if (shockScore > 60 && features.underlying.trend1m === features.underlying.trend5m) {
    patterns.push('Institutional directional pressure');
  }
  if (features.flow.callSweepDetected || features.flow.putSweepDetected) {
    patterns.push('Sweep-like flow detected');
  }
  if (accelerationScore > 70) {
    patterns.push('Velocity acceleration — move gaining speed');
  }
  if (walls.nearestWall && walls.nearestWallDistance && walls.nearestWallDistance < 10) {
    patterns.push(`Approaching ${walls.nearestWall.side} wall at ${walls.nearestWall.strike}`);
  }
  if (walls.callWall?.state === 'broken') {
    patterns.push('Call wall broken — potential gamma squeeze upside');
  }
  if (walls.putWall?.state === 'broken') {
    patterns.push('Put wall broken — potential gamma acceleration downside');
  }
  if (features.greeks.gexBias === 'negative' && shockScore > 40) {
    patterns.push('Negative GEX regime — dealer hedging amplifies moves');
  }
  if (
    features.underlying.trend1m === 'bullish' &&
    features.underlying.trend5m === 'bearish'
  ) {
    patterns.push('Short-term bounce in downtrend — possible trap');
  }

  return patterns;
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export async function computeShockEngine(
  features: SPXFeatures,
  walls: WallEngineOutput,
): Promise<ShockEngineOutput> {
  const warnings: string[] = [];
  const now = new Date().toISOString();
  const currentPrice = features.underlying.price;

  // 1. Fetch price history
  const history = await fetchPriceHistory(30);
  if (history.length < 5) {
    warnings.push('Insufficient price history — shock metrics limited');
  }

  // 2. Compute velocities
  const velocity1m = computeVelocity(history, 2);    // last 2 min
  const velocity5m = computeVelocity(history, 5);    // last 5 min

  // 3. Acceleration (second derivative)
  const acceleration =
    velocity1m !== null && velocity5m !== null
      ? velocity1m - velocity5m
      : null;

  // 4. Component scores
  const priceVelocityScore = computePriceVelocityScore(velocity1m);

  const prices = history.map(h => h.price);
  const suddenRepricingScore = computeSuddenRepricingScore(prices, currentPrice);

  const flowBurstScore = computeFlowBurstScore(
    features.flow.callVolumeBurst,
    features.flow.putVolumeBurst,
    features.flow.abnormalActivity,
    features.flow.sweepConfidence,
  );

  const gammaAccelScore = computeGammaAccelScore(
    features.greeks.gexBias,
    velocity1m,
    features.greeks.atmGamma,
  );

  const exhaustionSignal = computeExhaustionSignal(
    velocity1m,
    velocity5m,
    history.map(h => ({ price: h.price })),
    currentPrice,
  );

  // 5. Shock score
  const shockScore = clamp(
    0.35 * priceVelocityScore +
    0.30 * suddenRepricingScore +
    0.20 * flowBurstScore +
    0.15 * gammaAccelScore,
  );

  // 6. Acceleration score
  let accelerationScore = 0;
  if (velocity1m !== null && velocity5m !== null && Math.abs(velocity5m) > 0.1) {
    accelerationScore = clamp(
      Math.abs(velocity1m - velocity5m) / (Math.abs(velocity5m) + 0.1) * 100,
    );
  }

  // 7. Composite
  const compositeShockScore = clamp(0.6 * shockScore + 0.4 * accelerationScore);

  // 8. Continuation / reversal probabilities
  let contProb = 0.50;

  // Aligned trend → continuation
  if (
    features.underlying.trend1m !== 'unknown' &&
    features.underlying.trend1m === features.underlying.trend5m &&
    features.underlying.trend1m !== 'neutral'
  ) {
    contProb += 0.15;
  }

  // Flow on same side → continuation
  if (
    (features.underlying.trend1m === 'bullish' && features.flow.callPutFlowBias === 'call_heavy') ||
    (features.underlying.trend1m === 'bearish' && features.flow.callPutFlowBias === 'put_heavy')
  ) {
    contProb += 0.10;
  }

  // Negative GEX amplifies moves
  if (features.greeks.gexBias === 'negative') {
    contProb += 0.10;
  }

  // Exhaustion → reversal
  if (exhaustionSignal > 70) {
    contProb -= 0.20;
  }

  const continuationProbability = clampProb(contProb);
  const reversalProbability = clampProb(1 - continuationProbability);

  // 9. Severity
  const { severity, label: severityLabel } = getSeverity(compositeShockScore);

  // 10. Patterns
  const patterns = detectPatterns(shockScore, accelerationScore, features, walls);

  return {
    computedAt: now,
    underlyingPrice: currentPrice,
    shockScore: Math.round(shockScore),
    accelerationScore: Math.round(accelerationScore),
    compositeShockScore: Math.round(compositeShockScore),
    continuationProbability: Math.round(continuationProbability * 100) / 100,
    reversalProbability: Math.round(reversalProbability * 100) / 100,
    severity,
    severityLabel,
    directionalPressure: Math.round(priceVelocityScore),
    suddenRepricing: Math.round(suddenRepricingScore),
    flowBurst: Math.round(flowBurstScore),
    gammaAcceleration: Math.round(gammaAccelScore),
    exhaustionSignal: Math.round(exhaustionSignal),
    patterns,
    priceVelocity1m: velocity1m !== null ? Math.round(velocity1m * 100) / 100 : null,
    priceVelocity5m: velocity5m !== null ? Math.round(velocity5m * 100) / 100 : null,
    acceleration: acceleration !== null ? Math.round(acceleration * 100) / 100 : null,
    warnings,
  };
}
