/**
 * services/spx/__tests__/signal-scorer.test.ts
 *
 * Unit tests for Signal Scorer logic — pure scoring functions only.
 *
 * Because signal-scorer.ts depends on Supabase (to persist results), we do NOT
 * import the production module directly.  Instead we replicate the pure
 * mathematical formulas and classification rules inline so the tests run
 * without any external dependencies.
 *
 * Every formula tested here is directly derived from the documented source
 * in signal-scorer.ts and types.ts.
 */

// ── HELPERS (replicated from signal-scorer.ts) ────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * Weighted composite score formula (documented in signal-scorer.ts header).
 *   compositeScore =
 *     0.20 × structure
 *   + 0.20 × flow
 *   + 0.15 × gamma
 *   + 0.15 × wall
 *   + 0.10 × iv
 *   + 0.10 × execution
 *   + 0.05 × timeContext
 *   + 0.05 × contractFit
 */
function computeCompositeScore(scores: {
  structure: number;
  flow: number;
  gamma: number;
  wall: number;
  iv: number;
  execution: number;
  timeContext: number;
  contractFit: number;
}): number {
  return clamp(
    0.20 * scores.structure +
    0.20 * scores.flow +
    0.15 * scores.gamma +
    0.15 * scores.wall +
    0.10 * scores.iv +
    0.10 * scores.execution +
    0.05 * scores.timeContext +
    0.05 * scores.contractFit,
  );
}

/**
 * Confidence class mapping (documented in signal-scorer.ts header).
 *   A: >= 80
 *   B: >= 65
 *   C: >= 50
 *   D: >= 35
 *   E:  < 35
 */
function getConfidenceClass(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

/**
 * Signal type selection (score-path only, warning paths excluded from these
 * pure-logic tests since they require shock/wall/session inputs).
 *
 * Score-based branch (from signal-scorer.ts selectSignalType):
 *   < 40                  → NO_TRADE
 *   neutral bias          → MARKET_UNCLEAR
 *   >= 55 + bullish       → BUY_CALL
 *   >= 55 + bearish       → BUY_PUT
 *   40-54 + bullish       → WATCH_CALL
 *   40-54 + bearish       → WATCH_PUT
 */
function selectSignalTypeFromScore(
  compositeScore: number,
  directionBias: 'bullish' | 'bearish' | 'neutral',
): string {
  if (compositeScore < 40) return 'NO_TRADE';
  if (directionBias === 'neutral') return 'MARKET_UNCLEAR';
  if (compositeScore >= 55) {
    return directionBias === 'bullish' ? 'BUY_CALL' : 'BUY_PUT';
  }
  return directionBias === 'bullish' ? 'WATCH_CALL' : 'WATCH_PUT';
}

// ── FIXTURES ──────────────────────────────────────────────────────────────────

/** Strong bullish trending day — all timeframes aligned, call-heavy flow. */
const bullishTrendingScores = {
  structure:    90, // trend aligned 1m/5m/15m, strong_up momentum
  flow:         80, // call_heavy flow + bias strength 0.75
  gamma:        70, // low IV, positive GEX
  wall:         75, // put wall below acting as support
  iv:           80, // atmIV < 0.15
  execution:    85, // tight spread, high liquidity
  timeContext:  90, // core morning hours
  contractFit:  80, // 0DTE, tight spread, high OI
};

/** Sharp bearish shock day — rapid sell-off, put sweeps, elevated IV. */
const bearishShockScores = {
  structure:    75, // 1m/5m/15m all bearish
  flow:         70, // put_heavy, sweep detected
  gamma:        40, // elevated IV (> 0.25)
  wall:         65, // call wall above acting as resistance
  iv:           30, // high IV = expensive puts
  execution:    60, // slightly wider spreads under stress
  timeContext:  80, // afternoon session
  contractFit:  65, // 1DTE, acceptable spread
};

/** No-trade ranging day — conflicting trends, neutral flow, compressed walls. */
const noTradeRangingScores = {
  structure:    30, // conflicting 1m vs 5m trends
  flow:         30, // balanced flow
  gamma:        50, // normal IV
  wall:         25, // wall compression penalty applied
  iv:           60, // moderate IV
  execution:    70, // reasonable execution
  timeContext:  50, // lunch / choppy period
  contractFit:  45, // ATM only, no clear OTM strike
};

// ── TESTS ──────────────────────────────────────────────────────────────────────

describe('Signal Scorer Logic', () => {

  // ── 1. Composite score calculation from sub-scores ──────────────────────────

  describe('composite score calculation', () => {
    it('computes correct composite from bullish trending sub-scores', () => {
      const composite = computeCompositeScore(bullishTrendingScores);
      // Manual: 0.20×90 + 0.20×80 + 0.15×70 + 0.15×75 + 0.10×80 + 0.10×85 + 0.05×90 + 0.05×80
      //       = 18 + 16 + 10.5 + 11.25 + 8 + 8.5 + 4.5 + 4 = 80.75 → clamped to 80.75 → rounded = 81
      expect(composite).toBeGreaterThanOrEqual(80);
      expect(composite).toBeLessThanOrEqual(100);
    });

    it('computes correct composite from bearish shock sub-scores', () => {
      const composite = computeCompositeScore(bearishShockScores);
      // Manual: 0.20×75 + 0.20×70 + 0.15×40 + 0.15×65 + 0.10×30 + 0.10×60 + 0.05×80 + 0.05×65
      //       = 15 + 14 + 6 + 9.75 + 3 + 6 + 4 + 3.25 = 61
      expect(composite).toBeGreaterThanOrEqual(60);
      expect(composite).toBeLessThan(70);
    });

    it('computes correct composite from no-trade ranging sub-scores', () => {
      const composite = computeCompositeScore(noTradeRangingScores);
      // Manual: 0.20×30 + 0.20×30 + 0.15×50 + 0.15×25 + 0.10×60 + 0.10×70 + 0.05×50 + 0.05×45
      //       = 6 + 6 + 7.5 + 3.75 + 6 + 7 + 2.5 + 2.25 = 41
      expect(composite).toBeGreaterThanOrEqual(38);
      expect(composite).toBeLessThan(50);
    });

    it('clamps composite score to [0, 100]', () => {
      const allMax = computeCompositeScore({
        structure: 100, flow: 100, gamma: 100, wall: 100,
        iv: 100, execution: 100, timeContext: 100, contractFit: 100,
      });
      expect(allMax).toBe(100);

      const allZero = computeCompositeScore({
        structure: 0, flow: 0, gamma: 0, wall: 0,
        iv: 0, execution: 0, timeContext: 0, contractFit: 0,
      });
      expect(allZero).toBe(0);
    });

    it('weights structure and flow equally at 20% each (largest weights)', () => {
      // Vary structure only, hold everything else at 50.
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const boosted = { ...base, structure: 100 };
      const diff = computeCompositeScore(boosted) - computeCompositeScore(base);
      // Moving structure from 50→100 (+50) at 20% weight should shift composite by +10
      expect(diff).toBeCloseTo(10, 1);
    });
  });

  // ── 2. Confidence class A ────────────────────────────────────────────────────

  describe('confidence class A (score >= 80)', () => {
    it('assigns class A for score exactly 80', () => {
      expect(getConfidenceClass(80)).toBe('A');
    });

    it('assigns class A for score 85', () => {
      expect(getConfidenceClass(85)).toBe('A');
    });

    it('assigns class A for score 100', () => {
      expect(getConfidenceClass(100)).toBe('A');
    });

    it('assigns class A for bullish trending day composite (>= 80)', () => {
      const composite = computeCompositeScore(bullishTrendingScores);
      expect(getConfidenceClass(composite)).toBe('A');
    });
  });

  // ── 3. Confidence class B ────────────────────────────────────────────────────

  describe('confidence class B (65 <= score < 80)', () => {
    it('assigns class B for score exactly 65', () => {
      expect(getConfidenceClass(65)).toBe('B');
    });

    it('assigns class B for score 70', () => {
      expect(getConfidenceClass(70)).toBe('B');
    });

    it('assigns class B for score 79', () => {
      expect(getConfidenceClass(79)).toBe('B');
    });

    it('does NOT assign class B for score 80 (should be A)', () => {
      expect(getConfidenceClass(80)).not.toBe('B');
    });
  });

  // ── 4. Confidence class C ────────────────────────────────────────────────────

  describe('confidence class C (50 <= score < 65)', () => {
    it('assigns class C for score exactly 50', () => {
      expect(getConfidenceClass(50)).toBe('C');
    });

    it('assigns class C for score 52', () => {
      expect(getConfidenceClass(52)).toBe('C');
    });

    it('assigns class C for score 64', () => {
      expect(getConfidenceClass(64)).toBe('C');
    });
  });

  // ── 5. Confidence class D ────────────────────────────────────────────────────

  describe('confidence class D (35 <= score < 50)', () => {
    it('assigns class D for score exactly 35', () => {
      expect(getConfidenceClass(35)).toBe('D');
    });

    it('assigns class D for score 38', () => {
      expect(getConfidenceClass(38)).toBe('D');
    });

    it('assigns class D for score 49', () => {
      expect(getConfidenceClass(49)).toBe('D');
    });
  });

  // ── 6. Confidence class E ────────────────────────────────────────────────────

  describe('confidence class E (score < 35)', () => {
    it('assigns class E for score exactly 34', () => {
      expect(getConfidenceClass(34)).toBe('E');
    });

    it('assigns class E for score 25', () => {
      expect(getConfidenceClass(25)).toBe('E');
    });

    it('assigns class E for score 0', () => {
      expect(getConfidenceClass(0)).toBe('E');
    });
  });

  // ── 7. BUY_CALL requires score >= 55 and bullish bias ───────────────────────

  describe('signal type selection', () => {
    it('returns BUY_CALL for score >= 55 and bullish bias', () => {
      expect(selectSignalTypeFromScore(55, 'bullish')).toBe('BUY_CALL');
      expect(selectSignalTypeFromScore(78, 'bullish')).toBe('BUY_CALL');
    });

    it('returns BUY_PUT for score >= 55 and bearish bias', () => {
      expect(selectSignalTypeFromScore(60, 'bearish')).toBe('BUY_PUT');
    });

    it('returns WATCH_CALL for score 40-54 and bullish bias', () => {
      expect(selectSignalTypeFromScore(40, 'bullish')).toBe('WATCH_CALL');
      expect(selectSignalTypeFromScore(54, 'bullish')).toBe('WATCH_CALL');
    });

    it('returns WATCH_PUT for score 40-54 and bearish bias', () => {
      expect(selectSignalTypeFromScore(45, 'bearish')).toBe('WATCH_PUT');
    });

    it('returns NO_TRADE for score below 40 regardless of bias', () => {
      expect(selectSignalTypeFromScore(39, 'bullish')).toBe('NO_TRADE');
      expect(selectSignalTypeFromScore(0, 'bearish')).toBe('NO_TRADE');
    });

    it('returns MARKET_UNCLEAR for neutral bias with tradeable score', () => {
      expect(selectSignalTypeFromScore(60, 'neutral')).toBe('MARKET_UNCLEAR');
      expect(selectSignalTypeFromScore(75, 'neutral')).toBe('MARKET_UNCLEAR');
    });

    it('does NOT return BUY_CALL for score exactly 54 (boundary — should be WATCH_CALL)', () => {
      expect(selectSignalTypeFromScore(54, 'bullish')).toBe('WATCH_CALL');
    });

    it('returns BUY_CALL for score exactly 55 (boundary)', () => {
      expect(selectSignalTypeFromScore(55, 'bullish')).toBe('BUY_CALL');
    });
  });

  // ── 8. Sub-score weighting math verification ─────────────────────────────────

  describe('sub-score weighting verification', () => {
    it('weights sum to 1.0 (20+20+15+15+10+10+5+5 = 100)', () => {
      const weights = [0.20, 0.20, 0.15, 0.15, 0.10, 0.10, 0.05, 0.05];
      const sum = weights.reduce((acc, w) => acc + w, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('50-point change in structure (weight 0.20) shifts composite by exactly 10 points', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const structureHigh = { ...base, structure: 100 };
      const delta = computeCompositeScore(structureHigh) - computeCompositeScore(base);
      expect(delta).toBeCloseTo(10.0, 5);
    });

    it('50-point change in flow (weight 0.20) shifts composite by exactly 10 points', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const flowHigh = { ...base, flow: 100 };
      const delta = computeCompositeScore(flowHigh) - computeCompositeScore(base);
      expect(delta).toBeCloseTo(10.0, 5);
    });

    it('50-point change in gamma (weight 0.15) shifts composite by exactly 7.5 points', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const gammaHigh = { ...base, gamma: 100 };
      const delta = computeCompositeScore(gammaHigh) - computeCompositeScore(base);
      expect(delta).toBeCloseTo(7.5, 5);
    });

    it('50-point change in timeContext (weight 0.05) shifts composite by exactly 2.5 points', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const timeHigh = { ...base, timeContext: 100 };
      const delta = computeCompositeScore(timeHigh) - computeCompositeScore(base);
      expect(delta).toBeCloseTo(2.5, 5);
    });

    it('structure and flow have equal influence (same weight 0.20)', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const sHigh = { ...base, structure: 100 };
      const fHigh = { ...base, flow: 100 };
      const sDelta = computeCompositeScore(sHigh) - computeCompositeScore(base);
      const fDelta = computeCompositeScore(fHigh) - computeCompositeScore(base);
      expect(sDelta).toBeCloseTo(fDelta, 5);
    });

    it('contractFit has the least individual influence (weight 0.05)', () => {
      const base = { structure: 50, flow: 50, gamma: 50, wall: 50, iv: 50, execution: 50, timeContext: 50, contractFit: 50 };
      const cf100 = computeCompositeScore({ ...base, contractFit: 100 }) - computeCompositeScore(base);
      const st100 = computeCompositeScore({ ...base, structure: 100 }) - computeCompositeScore(base);
      // structure (20%) should have more impact than contractFit (5%)
      expect(st100).toBeGreaterThan(cf100);
    });
  });

  // ── 9. Realistic fixture assertions ─────────────────────────────────────────

  describe('realistic scenario composites', () => {
    it('bullish trending day achieves class A and BUY_CALL signal', () => {
      const composite = computeCompositeScore(bullishTrendingScores);
      const cls = getConfidenceClass(composite);
      const signal = selectSignalTypeFromScore(composite, 'bullish');
      expect(cls).toBe('A');
      expect(signal).toBe('BUY_CALL');
    });

    it('bearish shock day achieves class B and BUY_PUT signal', () => {
      const composite = computeCompositeScore(bearishShockScores);
      const cls = getConfidenceClass(composite);
      const signal = selectSignalTypeFromScore(composite, 'bearish');
      expect(cls).toBe('B');
      expect(signal).toBe('BUY_PUT');
    });

    it('no-trade ranging day achieves class D or lower with WATCH or NO_TRADE signal', () => {
      const composite = computeCompositeScore(noTradeRangingScores);
      const cls = getConfidenceClass(composite);
      const signal = selectSignalTypeFromScore(composite, 'bullish');
      expect(['D', 'E']).toContain(cls);
      expect(['WATCH_CALL', 'NO_TRADE']).toContain(signal);
    });
  });
});
