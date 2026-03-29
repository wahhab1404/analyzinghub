/**
 * services/spx/__tests__/entry-engine.test.ts
 *
 * Unit tests for the entry plan computation engine.
 *
 * entry-engine.ts exports a pure synchronous function `computeEntryPlan`
 * with no DB calls — it is safe to import and test directly.
 */

import { computeEntryPlan } from '../entry-engine';
import type { EntryContractInput } from '../entry-engine';
import type {
  SignalOutput,
  SPXFeatures,
  WallEngineOutput,
  ShockEngineOutput,
} from '../types';

// ── FIXTURES ──────────────────────────────────────────────────────────────────

const mockSignal: SignalOutput = {
  id:                      'test-signal-id',
  generatedAt:             '2026-03-28T14:00:00Z',
  underlyingPrice:         5420,
  signalType:              'BUY_CALL',
  signalMode:              'Trend',
  directionBias:           'bullish',
  marketMode:              'Trending',
  compositeScore:          78,
  confidenceClass:         'B',
  subScores: {
    structure: 82, flow: 74, gamma: 68, wall: 75,
    iv: 80, execution: 85, timeContext: 90, contractFit: 80,
  },
  rationale:               'BUY_CALL on Trend signal',
  keyFactors:              ['bullish trend aligned 1m/5m/15m'],
  risks:                   [],
  recommendedStrike:       5430,
  recommendedExpiry:       '2026-03-28',
  recommendedContractType: 'call',
  targetPremium:           5.50,
  expiresAt:               '2026-03-28T14:30:00Z',
};

const mockFeatures: SPXFeatures = {
  computedAt: '2026-03-28T14:00:00Z',
  underlying: {
    price:                5420,
    timestamp:            '2026-03-28T14:00:00Z',
    sessionOpen:          5400,
    sessionHigh:          5435,
    sessionLow:           5398,
    previousClose:        5410,
    trend1m:              'bullish',
    trend5m:              'bullish',
    trend15m:             'bullish',
    momentumSlope:        2.5,
    momentumLabel:        'strong_up',
    rangeExpansion:       1.3,
    openingRangeHigh:     5415,
    openingRangeLow:      5400,
    openingRangePosition: 'above',
    prevDayHigh:          5430,
    prevDayLow:           5380,
    relationToPrevDay:    'above_close',
    vwapEstimate:         5412,
    vwapRelation:         'above',
    distanceToSessionHigh: 15,
    distanceToSessionLow:  22,
    percentFromSessionHigh: 0.28,
    percentFromSessionLow:  0.41,
  },
  chain: {
    atmStrike:               5420,
    underlierAtCompute:      5420,
    nearITMStrike:           5410,
    nearOTMStrike:           5430,
    highOICallStrike:        5450,
    highOIPutStrike:         5400,
    highVolumeCallStrike:    5430,
    highVolumePutStrike:     5410,
    highGammaStrike:         5420,
    callConcentrationZone:   { low: 5440, high: 5460 },
    putConcentrationZone:    { low: 5390, high: 5410 },
    dteRegime:               '1DTE',
    nearestExpiry:           '2026-03-28',
    is0DTE:                  false,
    is1DTE:                  true,
    totalCallOI:             125000,
    totalPutOI:              95000,
    putCallOIRatio:          0.76,
    totalCallVolume:         42000,
    totalPutVolume:          31000,
    putCallVolumeRatio:      0.74,
  },
  greeks: {
    atmDelta:     0.50,
    atmGamma:     0.003,
    atmTheta:    -0.35,
    atmVega:      0.08,
    atmIV:        0.18,
    ivChange:    -0.005,
    gexEstimate:  150000,
    gexBias:      'positive',
    ivSkewEstimate: 0.02,
    skewBias:     'put_premium',
  },
  flow: {
    callVolumeBurst:    false,
    putVolumeBurst:     false,
    abnormalActivity:   false,
    callPutFlowBias:    'call_heavy',
    biasStrength:       0.65,
    callSweepDetected:  false,
    putSweepDetected:   false,
    sweepConfidence:    0,
    avgCallVolume:      35000,
    avgPutVolume:       28000,
  },
  execution: {
    bidAskSpread:    0.30,
    spreadPct:       5.77,
    spreadQuality:   'tight',
    liquidityScore:  82,
    slippageRiskLabel: 'low',
    quoteQuality:    'good',
  },
  marketMode:   'Trending',
  sessionType:  'regular',
  dataQuality:  'high',
  warnings:     [],
};

const mockWalls: WallEngineOutput = {
  computedAt:           '2026-03-28T14:00:00Z',
  underlyingPrice:      5420,
  callWall: {
    strike:            5460,
    side:              'call',
    strength:          72,
    openInterest:      45000,
    volume:            12000,
    gammaCluster:      8500,
    distanceFromPrice: 40,
    distancePct:       0.74,
    persistenceScore:  65,
    state:             'holding',
    firstSeenAt:       '2026-03-28T09:30:00Z',
    lastSeenAt:        '2026-03-28T14:00:00Z',
  },
  putWall: {
    strike:            5390,
    side:              'put',
    strength:          68,
    openInterest:      38000,
    volume:            9500,
    gammaCluster:      6200,
    distanceFromPrice: 30,
    distancePct:       0.55,
    persistenceScore:  55,
    state:             'holding',
    firstSeenAt:       '2026-03-28T09:30:00Z',
    lastSeenAt:        '2026-03-28T14:00:00Z',
  },
  nearestWall: null,
  nearestWallDistance: 30,
  secondaryCallWalls:  [],
  secondaryPutWalls:   [],
  wallMigration:       false,
  migrationDirection:  'none',
  wallCompression:     false,
  wallCompressionWidth: null,
  wallScore:           70,
  warnings:            [],
};

const mockShock: ShockEngineOutput = {
  computedAt:             '2026-03-28T14:00:00Z',
  underlyingPrice:        5420,
  shockScore:             5,
  accelerationScore:      3,
  compositeShockScore:    4,
  continuationProbability: 0.4,
  reversalProbability:    0.2,
  severity:              'none',
  severityLabel:         'No shock',
  directionalPressure:    8,
  suddenRepricing:        3,
  flowBurst:              5,
  gammaAcceleration:      2,
  exhaustionSignal:      10,
  patterns:              [],
  priceVelocity1m:       1.2,
  priceVelocity5m:       0.8,
  acceleration:          0.1,
  warnings:              [],
};

const mockContract: EntryContractInput = {
  mid:        5.20,
  strike:     5430,
  optionType: 'call',
  dte:        1,
  spread:     0.30,
};

// ── TESTS ──────────────────────────────────────────────────────────────────────

describe('computeEntryPlan (entry-engine.ts)', () => {

  let plan: ReturnType<typeof computeEntryPlan>;

  beforeAll(() => {
    plan = computeEntryPlan(mockSignal, mockFeatures, mockContract, mockWalls, mockShock);
  });

  // ── 1. Entry zone: ±3% band around contract mid ──────────────────────────────

  describe('entry zone calculation', () => {
    it('suggestedEntryLow is mid × 0.97', () => {
      expect(plan.suggestedEntryLow).toBeCloseTo(mockContract.mid * 0.97, 5);
    });

    it('suggestedEntryHigh is mid × 1.03', () => {
      expect(plan.suggestedEntryHigh).toBeCloseTo(mockContract.mid * 1.03, 5);
    });

    it('entry zone is centred near the contract mid price', () => {
      const midZone = (plan.suggestedEntryLow + plan.suggestedEntryHigh) / 2;
      expect(midZone).toBeCloseTo(mockContract.mid, 2);
    });

    it('entry zone width is approximately 6% of mid price', () => {
      const width = plan.suggestedEntryHigh - plan.suggestedEntryLow;
      expect(width).toBeCloseTo(mockContract.mid * 0.06, 4);
    });

    it('suggestedEntryLow is less than suggestedEntryHigh', () => {
      expect(plan.suggestedEntryLow).toBeLessThan(plan.suggestedEntryHigh);
    });
  });

  // ── 2. Hard stop: derived from put wall for a call trade ────────────────────

  describe('hard stop SPX calculation', () => {
    it('hard stop is derived from put wall strike for a call trade (wall present below price)', () => {
      // put wall at 5390, price at 5420 → putWall.strike < underlyingPrice → hardStop = 5390 - 5 = 5385
      expect(plan.hardStopSpx).toBeCloseTo(mockWalls.putWall!.strike - 5, 5);
    });

    it('hard stop is below the current underlying price for a call trade', () => {
      expect(plan.hardStopSpx).toBeLessThan(mockSignal.underlyingPrice);
    });

    it('computes fallback hard stop using bps when put wall is not present (0DTE)', () => {
      const contract0DTE: EntryContractInput = { ...mockContract, dte: 0 };
      const wallsNoPutWall: WallEngineOutput = { ...mockWalls, putWall: null };
      const plan0DTE = computeEntryPlan(mockSignal, mockFeatures, contract0DTE, wallsNoPutWall, mockShock);
      // 0DTE fallback: underlyingPrice - underlyingPrice × 0.003 = 5420 - 16.26 = 5403.74
      expect(plan0DTE.hardStopSpx).toBeCloseTo(5420 - 5420 * 0.003, 2);
    });

    it('computes fallback hard stop using 50bps for 1DTE when put wall is absent', () => {
      const wallsNoPutWall: WallEngineOutput = { ...mockWalls, putWall: null };
      const planNoPut = computeEntryPlan(mockSignal, mockFeatures, mockContract, wallsNoPutWall, mockShock);
      // 1DTE fallback: underlyingPrice × (1 - 0.005) = 5420 × 0.995 = 5392.9
      expect(planNoPut.hardStopSpx).toBeCloseTo(5420 - 5420 * 0.005, 2);
    });
  });

  // ── 3. Profit targets ────────────────────────────────────────────────────────

  describe('profit targets (confidence class B multipliers)', () => {
    // Confidence B multipliers: t1=1.35, t2=1.75, t3=2.40, runner=3.50

    it('target 1 is mid × 1.35 for confidence class B signal', () => {
      expect(plan.target1Premium).toBeCloseTo(mockContract.mid * 1.35, 5);
    });

    it('target 2 is mid × 1.75 for confidence class B signal', () => {
      expect(plan.target2Premium).toBeCloseTo(mockContract.mid * 1.75, 5);
    });

    it('target 3 is mid × 2.40 for confidence class B signal', () => {
      expect(plan.target3Premium).toBeCloseTo(mockContract.mid * 2.40, 5);
    });

    it('runner premium is mid × 3.50 for confidence class B signal', () => {
      expect(plan.runnerPremium).toBeCloseTo(mockContract.mid * 3.50, 5);
    });

    it('targets are strictly ascending: T1 < T2 < T3 < runner', () => {
      expect(plan.target1Premium).toBeLessThan(plan.target2Premium);
      expect(plan.target2Premium).toBeLessThan(plan.target3Premium);
      expect(plan.target3Premium).toBeLessThan(plan.runnerPremium);
    });

    it('target 1 represents approximately +35% premium expansion from mid', () => {
      const expansion = (plan.target1Premium - mockContract.mid) / mockContract.mid * 100;
      expect(expansion).toBeCloseTo(35, 1);
    });

    it('target 2 represents approximately +75% premium expansion from mid', () => {
      const expansion = (plan.target2Premium - mockContract.mid) / mockContract.mid * 100;
      expect(expansion).toBeCloseTo(75, 1);
    });
  });

  // ── 4. Stop premium (DTE-tiered loss threshold) ──────────────────────────────

  describe('stop premium calculation', () => {
    it('stop premium for 1DTE is mid × 0.65 (35% maximum loss)', () => {
      expect(plan.stopPremium).toBeCloseTo(mockContract.mid * 0.65, 5);
    });

    it('stop premium for 0DTE is mid × 0.60 (tighter — 40% maximum loss)', () => {
      const contract0DTE: EntryContractInput = { ...mockContract, dte: 0 };
      const plan0DTE = computeEntryPlan(mockSignal, mockFeatures, contract0DTE, mockWalls, mockShock);
      expect(plan0DTE.stopPremium).toBeCloseTo(mockContract.mid * 0.60, 5);
    });

    it('stop premium for weekly (2+ DTE) is mid × 0.70 (30% maximum loss)', () => {
      const contractWeekly: EntryContractInput = { ...mockContract, dte: 3 };
      const planWeekly = computeEntryPlan(mockSignal, mockFeatures, contractWeekly, mockWalls, mockShock);
      expect(planWeekly.stopPremium).toBeCloseTo(mockContract.mid * 0.70, 5);
    });

    it('stop premium is always below the entry low (protects against oversize loss)', () => {
      expect(plan.stopPremium).toBeLessThan(plan.suggestedEntryLow);
    });
  });

  // ── 5. Time stop (30 minutes before market close heuristic) ─────────────────

  describe('time stop calculation', () => {
    it('time stop is a valid ISO timestamp string', () => {
      expect(plan.timeStopAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('time stop for 1DTE is at 18:00 UTC (1:00 PM ET) on expiry day', () => {
      // mockSignal.recommendedExpiry = '2026-03-28'
      expect(plan.timeStopAt).toBe('2026-03-28T18:00:00.000Z');
    });

    it('time stop for 0DTE is at 19:30 UTC (2:30 PM ET) on expiry day', () => {
      const contract0DTE: EntryContractInput = { ...mockContract, dte: 0 };
      const plan0DTE = computeEntryPlan(mockSignal, mockFeatures, contract0DTE, mockWalls, mockShock);
      expect(plan0DTE.timeStopAt).toBe('2026-03-28T19:30:00.000Z');
    });

    it('time stop is before end-of-trading-day (before 21:00 UTC / 4:00 PM ET)', () => {
      const stopTime = new Date(plan.timeStopAt).getUTCHours();
      expect(stopTime).toBeLessThan(21);
    });
  });

  // ── 6. Soft stop conditions ───────────────────────────────────────────────────

  describe('soft stop conditions', () => {
    it('returns an array of soft stop conditions', () => {
      expect(Array.isArray(plan.softStopConditions)).toBe(true);
      expect(plan.softStopConditions.length).toBeGreaterThan(0);
    });

    it('includes VWAP break condition for a call trade', () => {
      const hasVwap = plan.softStopConditions.some(c =>
        c.toLowerCase().includes('vwap'),
      );
      expect(hasVwap).toBe(true);
    });

    it('includes IV collapse condition when atmIV is available', () => {
      const hasIVCollapse = plan.softStopConditions.some(c =>
        c.toLowerCase().includes('iv'),
      );
      expect(hasIVCollapse).toBe(true);
    });

    it('does NOT include shock reversal condition when shock severity is none', () => {
      const hasShockReversal = plan.softStopConditions.some(c =>
        c.toLowerCase().includes('shock reversal'),
      );
      expect(hasShockReversal).toBe(false);
    });

    it('includes shock reversal condition when shock is present', () => {
      const activeShock: ShockEngineOutput = {
        ...mockShock,
        severity:            'moderate',
        compositeShockScore: 55,
      };
      const planWithShock = computeEntryPlan(mockSignal, mockFeatures, mockContract, mockWalls, activeShock);
      const hasShockReversal = planWithShock.softStopConditions.some(c =>
        c.toLowerCase().includes('shock reversal'),
      );
      expect(hasShockReversal).toBe(true);
    });
  });

  // ── 7. Confidence class A produces more aggressive targets ──────────────────

  describe('confidence class A produces higher target multipliers', () => {
    it('confidence A target 1 > confidence B target 1 for same mid price', () => {
      const signalA: SignalOutput = { ...mockSignal, confidenceClass: 'A', compositeScore: 85 };
      const planA = computeEntryPlan(signalA, mockFeatures, mockContract, mockWalls, mockShock);
      // Class A t1 = 1.45, Class B t1 = 1.35
      expect(planA.target1Premium).toBeGreaterThan(plan.target1Premium);
    });

    it('confidence C produces more conservative target 1 than class B', () => {
      const signalC: SignalOutput = { ...mockSignal, confidenceClass: 'C', compositeScore: 55 };
      const planC = computeEntryPlan(signalC, mockFeatures, mockContract, mockWalls, mockShock);
      // Class C t1 = 1.25, Class B t1 = 1.35
      expect(planC.target1Premium).toBeLessThan(plan.target1Premium);
    });
  });

  // ── 8. Shock mode boosts targets by 0.20 ────────────────────────────────────

  describe('shock mode target boost', () => {
    it('Momentum_Shock mode adds 0.20 to all multipliers vs standard Trend mode', () => {
      const shockSignal: SignalOutput = { ...mockSignal, signalMode: 'Momentum_Shock' };
      const planShock = computeEntryPlan(shockSignal, mockFeatures, mockContract, mockWalls, mockShock);
      // Confidence B: base t1=1.35, shock t1=1.55 → diff = 0.20 × mid
      const diff = planShock.target1Premium - plan.target1Premium;
      expect(diff).toBeCloseTo(mockContract.mid * 0.20, 4);
    });

    it('Trend_Acceleration mode also applies the 0.20 boost', () => {
      const accelSignal: SignalOutput = { ...mockSignal, signalMode: 'Trend_Acceleration' };
      const planAccel = computeEntryPlan(accelSignal, mockFeatures, mockContract, mockWalls, mockShock);
      const diff = planAccel.target1Premium - plan.target1Premium;
      expect(diff).toBeCloseTo(mockContract.mid * 0.20, 4);
    });
  });

  // ── 9. Rationale string ──────────────────────────────────────────────────────

  describe('rationale string', () => {
    it('includes the signal direction verb (BUY_CALL for a call trade)', () => {
      expect(plan.rationale).toContain('BUY_CALL');
    });

    it('includes the composite score', () => {
      expect(plan.rationale).toContain(String(mockSignal.compositeScore));
    });

    it('includes the confidence class', () => {
      expect(plan.rationale).toContain(mockSignal.confidenceClass);
    });

    it('includes formatted entry low and high prices', () => {
      expect(plan.rationale).toContain('$');
    });
  });
});
