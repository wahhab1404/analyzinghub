/**
 * services/spx/__tests__/wall-engine.test.ts
 *
 * Unit tests for wall detection and scoring logic — pure functions only.
 *
 * The production wall-engine.ts depends on Supabase and Polygon for data
 * fetching and persistence.  These tests replicate the pure mathematical
 * formulas and state-transition rules from wall-engine.ts inline so the
 * tests run without any external dependencies.
 *
 * Formulas tested here are directly derived from wall-engine.ts.
 */

// ── HELPERS (replicated from wall-engine.ts) ──────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * Wall strength formula (documented in wall-engine.ts header):
 *   strength = (
 *     0.40 × (strike_oi / max_strike_oi)          ← OI concentration
 *   + 0.30 × (strike_volume / max_strike_volume)  ← Volume concentration
 *   + 0.20 × (near_gamma_sum / total_gamma)       ← Gamma cluster
 *   + 0.10 × nearby_reinforcement_bonus           ← Adjacent strike OI >= 50% of peak
 *   ) × 100
 */
function computeWallStrength(params: {
  strikeOI: number;
  maxChainOI: number;
  strikeVolume: number;
  maxChainVolume: number;
  nearGammaSum: number;   // gamma for this strike + ±10pt neighbours
  totalChainGamma: number;
  hasReinforcingNeighbour: boolean; // adjacent strike OI >= 50% of this strike's OI
}): number {
  const { strikeOI, maxChainOI, strikeVolume, maxChainVolume,
          nearGammaSum, totalChainGamma, hasReinforcingNeighbour } = params;

  if (maxChainOI === 0) return 0;

  const oiConc     = maxChainOI     > 0 ? strikeOI      / maxChainOI     : 0;
  const volConc    = maxChainVolume  > 0 ? strikeVolume   / maxChainVolume  : 0;
  const gammaClust = totalChainGamma > 0 ? nearGammaSum  / totalChainGamma : 0;
  const reinforce  = hasReinforcingNeighbour ? 1 : 0;

  return clamp((0.40 * oiConc + 0.30 * volConc + 0.20 * gammaClust + 0.10 * reinforce) * 100);
}

/**
 * Wall distance helpers.
 */
function wallDistancePoints(wallStrike: number, underlyingPrice: number): number {
  return Math.abs(wallStrike - underlyingPrice);
}

function wallDistancePct(wallStrike: number, underlyingPrice: number): number {
  return (wallDistancePoints(wallStrike, underlyingPrice) / underlyingPrice) * 100;
}

/**
 * Wall state detection (from wall-engine.ts detectWallState):
 *   distancePct > 0.5% → 'holding' (or 'rejected' if previously 'approached')
 *   distancePct <= 0.3% → 'approached'
 *   price crossed through wall → 'broken'
 */
function detectWallState(
  wallStrike: number,
  underlyingPrice: number,
  side: 'call' | 'put',
  prevState: 'holding' | 'approached' | 'rejected' | 'broken' | null,
): 'holding' | 'approached' | 'rejected' | 'broken' {
  const distancePct = Math.abs(wallStrike - underlyingPrice) / underlyingPrice;

  if (distancePct > 0.005) {
    // Price has moved away — if it was previously approached, that's a rejection
    if (prevState === 'approached') {
      if (side === 'call' && underlyingPrice < wallStrike) return 'rejected';
      if (side === 'put'  && underlyingPrice > wallStrike) return 'rejected';
    }
    return 'holding';
  }

  if (distancePct <= 0.003) return 'approached';

  // Check for broken: price has closed on the far side
  if (side === 'call' && underlyingPrice > wallStrike * 1.002) return 'broken';
  if (side === 'put'  && underlyingPrice < wallStrike * 0.998) return 'broken';

  return 'holding';
}

/**
 * Wall compression detection: call_wall_strike - put_wall_strike < 30 points.
 */
function isWallCompressed(callWallStrike: number, putWallStrike: number): boolean {
  return (callWallStrike - putWallStrike) > 0 && (callWallStrike - putWallStrike) < 30;
}

/**
 * Nearest wall selection: returns whichever of the two walls is closest to price.
 */
function selectNearestWall(
  callWall: { strike: number; distanceFromPrice: number } | null,
  putWall:  { strike: number; distanceFromPrice: number } | null,
): { strike: number; side: 'call' | 'put' } | null {
  if (!callWall && !putWall) return null;
  if (!callWall) return { strike: putWall!.strike, side: 'put' };
  if (!putWall)  return { strike: callWall.strike, side: 'call' };
  return callWall.distanceFromPrice <= putWall.distanceFromPrice
    ? { strike: callWall.strike, side: 'call' }
    : { strike: putWall.strike,  side: 'put'  };
}

/**
 * Aggregate wall score (from wall-engine.ts):
 *   wallScore = clamp((callStrength × 0.5 + putStrength × 0.5) + compressionBonus)
 *   compressionBonus = wallCompression ? 10 : 0
 */
function computeAggregateWallScore(
  callStrength: number,
  putStrength: number,
  isCompressed: boolean,
): number {
  const compressionBonus = isCompressed ? 10 : 0;
  return clamp((callStrength * 0.5 + putStrength * 0.5) + compressionBonus);
}

// ── FIXTURES ──────────────────────────────────────────────────────────────────

const UNDERLYING_PRICE = 5420;

const mockCallWall = {
  strike: 5450,
  side: 'call' as const,
  strength: 72,
  openInterest: 45000,
  volume: 12000,
  gammaCluster: 8500,
  distanceFromPrice: 30,
  distancePct: 0.55,
  persistenceScore: 65,
  state: 'holding' as const,
  firstSeenAt: '2026-03-24T09:30:00Z',
  lastSeenAt:  '2026-03-24T14:00:00Z',
};

const mockPutWall = {
  strike: 5390,
  side: 'put' as const,
  strength: 68,
  openInterest: 38000,
  volume: 9500,
  gammaCluster: 6200,
  distanceFromPrice: 30,
  distancePct: 0.55,
  persistenceScore: 55,
  state: 'holding' as const,
  firstSeenAt: '2026-03-24T09:30:00Z',
  lastSeenAt:  '2026-03-24T14:00:00Z',
};

// ── TESTS ──────────────────────────────────────────────────────────────────────

describe('Wall Engine Logic', () => {

  // ── 1. Wall strength formula ─────────────────────────────────────────────────

  describe('wall strength formula', () => {
    it('computes full-strength wall (100) when strike dominates all metrics and reinforced', () => {
      const strength = computeWallStrength({
        strikeOI:               50000,
        maxChainOI:             50000,  // this strike IS the max
        strikeVolume:           15000,
        maxChainVolume:         15000,  // this strike IS the max volume
        nearGammaSum:           10000,
        totalChainGamma:        10000,  // all gamma clustered here
        hasReinforcingNeighbour: true,
      });
      // 0.40×1.0 + 0.30×1.0 + 0.20×1.0 + 0.10×1.0 = 1.0 × 100 = 100
      expect(strength).toBe(100);
    });

    it('weights OI concentration at 40% of total strength', () => {
      // Only OI contribution, others zero
      const strength = computeWallStrength({
        strikeOI: 50000, maxChainOI: 50000,
        strikeVolume: 0,  maxChainVolume: 1,
        nearGammaSum: 0,  totalChainGamma: 1,
        hasReinforcingNeighbour: false,
      });
      // 0.40 × 1.0 × 100 = 40
      expect(strength).toBeCloseTo(40, 1);
    });

    it('weights volume concentration at 30% of total strength', () => {
      const strength = computeWallStrength({
        strikeOI: 0,      maxChainOI: 1,
        strikeVolume: 15000, maxChainVolume: 15000,
        nearGammaSum: 0,  totalChainGamma: 1,
        hasReinforcingNeighbour: false,
      });
      // 0.30 × 1.0 × 100 = 30
      expect(strength).toBeCloseTo(30, 1);
    });

    it('weights gamma cluster at 20% of total strength', () => {
      const strength = computeWallStrength({
        strikeOI: 0,  maxChainOI: 1,
        strikeVolume: 0, maxChainVolume: 1,
        nearGammaSum: 10000, totalChainGamma: 10000,
        hasReinforcingNeighbour: false,
      });
      // 0.20 × 1.0 × 100 = 20
      expect(strength).toBeCloseTo(20, 1);
    });

    it('weights reinforcement bonus at 10% when neighbouring strikes are strong', () => {
      const withReinforcement = computeWallStrength({
        strikeOI: 0, maxChainOI: 1,
        strikeVolume: 0, maxChainVolume: 1,
        nearGammaSum: 0, totalChainGamma: 1,
        hasReinforcingNeighbour: true,
      });
      const withoutReinforcement = computeWallStrength({
        strikeOI: 0, maxChainOI: 1,
        strikeVolume: 0, maxChainVolume: 1,
        nearGammaSum: 0, totalChainGamma: 1,
        hasReinforcingNeighbour: false,
      });
      // 0.10 × 1 × 100 = 10 point difference
      expect(withReinforcement - withoutReinforcement).toBeCloseTo(10, 1);
    });

    it('returns 0 when chain OI is zero (guard against division by zero)', () => {
      const strength = computeWallStrength({
        strikeOI: 0, maxChainOI: 0,
        strikeVolume: 0, maxChainVolume: 0,
        nearGammaSum: 0, totalChainGamma: 0,
        hasReinforcingNeighbour: false,
      });
      expect(strength).toBe(0);
    });

    it('clamps strength to [0, 100]', () => {
      const strength = computeWallStrength({
        strikeOI: 99999, maxChainOI: 1,
        strikeVolume: 99999, maxChainVolume: 1,
        nearGammaSum: 99999, totalChainGamma: 1,
        hasReinforcingNeighbour: true,
      });
      expect(strength).toBe(100);
    });
  });

  // ── 2. Wall distance calculation ─────────────────────────────────────────────

  describe('wall distance calculation', () => {
    it('computes absolute distance in SPX points correctly', () => {
      expect(wallDistancePoints(5450, UNDERLYING_PRICE)).toBe(30);
      expect(wallDistancePoints(5390, UNDERLYING_PRICE)).toBe(30);
    });

    it('computes distance as a percentage of underlying price', () => {
      const pct = wallDistancePct(5450, UNDERLYING_PRICE);
      // (30 / 5420) × 100 ≈ 0.5535%
      expect(pct).toBeCloseTo((30 / 5420) * 100, 3);
    });

    it('distance is symmetric (absolute value)', () => {
      const callDist = wallDistancePoints(mockCallWall.strike, UNDERLYING_PRICE);
      const putDist  = wallDistancePoints(mockPutWall.strike, UNDERLYING_PRICE);
      expect(callDist).toBeGreaterThan(0);
      expect(putDist).toBeGreaterThan(0);
    });
  });

  // ── 3. Wall state transitions ────────────────────────────────────────────────

  describe('wall state transitions', () => {
    it('returns "holding" when price is > 0.5% away from wall', () => {
      // 5450 call wall, price at 5420 → distance = 30 pts → 0.553% > 0.5%
      const state = detectWallState(5450, UNDERLYING_PRICE, 'call', null);
      expect(state).toBe('holding');
    });

    it('returns "approached" when price is within 0.3% of wall', () => {
      // 5420 × 0.003 = 16.26 pts → price at 5436 gives distance 14, well within 0.3%
      const nearPrice = 5450 - 5;  // 5 pts away = 0.09%
      const state = detectWallState(5450, nearPrice, 'call', null);
      expect(state).toBe('approached');
    });

    it('returns "rejected" when price was previously "approached" and moved away', () => {
      // Price previously tested the wall (5445) and now retreated to 5420
      const state = detectWallState(5450, UNDERLYING_PRICE, 'call', 'approached');
      // distance = 30 pts = 0.553% > 0.5%, and side === call and price < wall → rejected
      expect(state).toBe('rejected');
    });

    it('returns "broken" when call wall is breached (price above wall × 1.002)', () => {
      // Call wall at 5450, price has closed at 5465 (above 5450 × 1.002 = 5459.9)
      const state = detectWallState(5450, 5465, 'call', 'approached');
      expect(state).toBe('broken');
    });

    it('returns "broken" when put wall is breached (price below wall × 0.998)', () => {
      // Put wall at 5390, price has closed at 5375 (below 5390 × 0.998 = 5379.22)
      const state = detectWallState(5390, 5375, 'put', 'approached');
      expect(state).toBe('broken');
    });

    it('returns "holding" (not "rejected") when price moves away from wall with no prior approach', () => {
      const state = detectWallState(5450, UNDERLYING_PRICE, 'call', 'holding');
      expect(state).toBe('holding');
    });
  });

  // ── 4. Wall compression detection ────────────────────────────────────────────

  describe('wall compression detection', () => {
    it('detects compression when call wall minus put wall < 30 points', () => {
      // 5430 call wall, 5405 put wall → width = 25 pts
      expect(isWallCompressed(5430, 5405)).toBe(true);
    });

    it('does not detect compression at exactly 30 points (exclusive boundary)', () => {
      // 5450 - 5420 = 30
      expect(isWallCompressed(5450, 5420)).toBe(false);
    });

    it('does not detect compression at wide spacing (> 30 pts)', () => {
      // call 5460, put 5390 → width = 70 pts
      expect(isWallCompressed(5460, 5390)).toBe(false);
    });

    it('handles tight compression (< 10 pts) for extreme pinning scenarios', () => {
      // 5420 call wall, 5415 put wall → width = 5 pts
      expect(isWallCompressed(5420, 5415)).toBe(true);
    });
  });

  // ── 5. Nearest wall selection ────────────────────────────────────────────────

  describe('nearest wall selection', () => {
    it('selects the call wall when it is closer to price', () => {
      const nearest = selectNearestWall(
        { strike: 5430, distanceFromPrice: 10 },  // closer
        { strike: 5390, distanceFromPrice: 30 },
      );
      expect(nearest).not.toBeNull();
      expect(nearest!.side).toBe('call');
      expect(nearest!.strike).toBe(5430);
    });

    it('selects the put wall when it is closer to price', () => {
      const nearest = selectNearestWall(
        { strike: 5450, distanceFromPrice: 30 },
        { strike: 5415, distanceFromPrice: 5 },   // closer
      );
      expect(nearest).not.toBeNull();
      expect(nearest!.side).toBe('put');
      expect(nearest!.strike).toBe(5415);
    });

    it('selects call wall when distances are equal (call wins tiebreak)', () => {
      const nearest = selectNearestWall(
        { strike: 5440, distanceFromPrice: 20 },
        { strike: 5400, distanceFromPrice: 20 },
      );
      expect(nearest).not.toBeNull();
      expect(nearest!.side).toBe('call');
    });

    it('returns put wall when call wall is null', () => {
      const nearest = selectNearestWall(null, { strike: 5390, distanceFromPrice: 30 });
      expect(nearest).not.toBeNull();
      expect(nearest!.side).toBe('put');
    });

    it('returns call wall when put wall is null', () => {
      const nearest = selectNearestWall({ strike: 5450, distanceFromPrice: 30 }, null);
      expect(nearest).not.toBeNull();
      expect(nearest!.side).toBe('call');
    });

    it('returns null when both walls are null', () => {
      expect(selectNearestWall(null, null)).toBeNull();
    });
  });

  // ── 6. Aggregate wall score ───────────────────────────────────────────────────

  describe('aggregate wall score', () => {
    it('averages call and put strength equally (50/50 weighting)', () => {
      const score = computeAggregateWallScore(80, 60, false);
      // (80 × 0.5 + 60 × 0.5) = 70
      expect(score).toBeCloseTo(70, 1);
    });

    it('adds 10-point compression bonus when walls are compressed', () => {
      const base       = computeAggregateWallScore(60, 60, false);
      const compressed = computeAggregateWallScore(60, 60, true);
      expect(compressed - base).toBeCloseTo(10, 1);
    });

    it('clamps aggregate score to 100 even with compression bonus', () => {
      const score = computeAggregateWallScore(100, 100, true);
      // (100+100)/2 + 10 = 110 → clamped to 100
      expect(score).toBe(100);
    });

    it('returns 0 when both walls have zero strength', () => {
      expect(computeAggregateWallScore(0, 0, false)).toBe(0);
    });

    it('fixture call + put wall score falls in expected range', () => {
      const score = computeAggregateWallScore(
        mockCallWall.strength,
        mockPutWall.strength,
        false,
      );
      // (72 × 0.5 + 68 × 0.5) = 70
      expect(score).toBeCloseTo(70, 1);
    });
  });
});
