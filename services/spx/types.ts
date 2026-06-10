/**
 * services/spx/types.ts
 *
 * Phase 2 — SPX Options Intelligence Engine
 * All domain types for: features, walls, shocks, signals, contract ranking.
 *
 * IMPORTANT: Pure types only — no business logic in this file.
 */

// ── MARKET CONTEXT ─────────────────────────────────────────────────────────────

export type TrendDirection = 'bullish' | 'bearish' | 'neutral' | 'unknown';

export type MarketMode =
  | 'Trending'
  | 'Ranging'
  | 'Expanding'
  | 'Compressing'
  | 'Shock'
  | 'Recovery'
  | 'Pre-Market'
  | 'Post-Market'
  | 'Unknown';

export type DTERegime = '0DTE' | '1DTE' | 'Weekly' | 'Monthly' | 'Other';

export type SessionType =
  | 'pre_market'
  | 'regular'
  | 'after_hours'
  | 'weekend'
  | 'unknown';

// ── UNDERLYING FEATURES ────────────────────────────────────────────────────────

export interface UnderlyingFeatures {
  /** Live SPX index value */
  price: number;
  /** UTC timestamp of this observation */
  timestamp: string;

  // Session context (from Polygon snapshot)
  sessionOpen: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  previousClose: number | null;

  // Trend (derived from stored spx_price_history)
  trend1m: TrendDirection;
  trend5m: TrendDirection;
  trend15m: TrendDirection;

  /**
   * Momentum slope: linear regression slope (points/min) over the last
   * 15 price history data points. Positive = accelerating up.
   */
  momentumSlope: number | null;
  momentumLabel: 'strong_up' | 'weak_up' | 'flat' | 'weak_down' | 'strong_down';

  /**
   * Range expansion ratio: current session range / opening-range (first 30 min).
   * >1 means range has expanded beyond the opening range.
   * null when history is insufficient.
   */
  rangeExpansion: number | null;
  openingRangeHigh: number | null;
  openingRangeLow: number | null;
  openingRangePosition: 'above' | 'below' | 'inside' | 'unknown';

  // Key prior-day levels (from Polygon session data)
  prevDayHigh: number | null;
  prevDayLow: number | null;
  relationToPrevDay:
    | 'above_high'
    | 'above_close'
    | 'inside_range'
    | 'below_close'
    | 'below_low'
    | 'unknown';

  /**
   * VWAP estimate (heuristic).
   * I:SPX is an index — there is no "volume" in the traditional sense.
   * We use a time-weighted average (TWA) of all stored prices since session
   * open as a VWAP proxy. Documented as TWA-VWAP in the UI.
   */
  vwapEstimate: number | null;
  vwapRelation: 'above' | 'below' | 'at' | 'unknown';

  // Distance to session extremes
  distanceToSessionHigh: number | null;   // SPX points
  distanceToSessionLow: number | null;
  percentFromSessionHigh: number | null;
  percentFromSessionLow: number | null;
}

// ── OPTIONS CHAIN FEATURES ─────────────────────────────────────────────────────

export interface OptionsChainFeatures {
  /** ATM strike (rounded to nearest strike increment) */
  atmStrike: number;
  underlierAtCompute: number;

  /** Nearest in-the-money strike for the dominant direction */
  nearITMStrike: number | null;
  nearOTMStrike: number | null;

  /** Strikes with highest OI concentration */
  highOICallStrike: number | null;
  highOIPutStrike: number | null;

  /** Strikes with highest intraday volume */
  highVolumeCallStrike: number | null;
  highVolumePutStrike: number | null;

  /** Strike with highest aggregated gamma (potential pinning strike) */
  highGammaStrike: number | null;

  /**
   * Strike clustering zones.
   * Call concentration: band of strikes where cumulative call OI is highest.
   * Put concentration: same for puts.
   */
  callConcentrationZone: { low: number; high: number } | null;
  putConcentrationZone: { low: number; high: number } | null;

  // Expiry context
  dteRegime: DTERegime;
  nearestExpiry: string;  // YYYY-MM-DD
  is0DTE: boolean;
  is1DTE: boolean;

  // Chain-level aggregate metrics
  totalCallOI: number;
  totalPutOI: number;
  /** put OI / call OI — >1 means put-heavy positioning */
  putCallOIRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  putCallVolumeRatio: number;
}

// ── GREEKS / VOLATILITY FEATURES ──────────────────────────────────────────────

export interface GreeksFeatures {
  /** ATM contract greeks (from nearest-strike Polygon snapshot) */
  atmDelta: number | null;
  atmGamma: number | null;
  atmTheta: number | null;
  atmVega: number | null;
  atmIV: number | null;

  /**
   * IV change since last snapshot.
   * null when no previous snapshot exists.
   */
  ivChange: number | null;

  /**
   * Gamma Exposure (GEX) estimate — a heuristic.
   *
   * HEURISTIC DOCUMENTATION:
   * GEX = Σ (gamma_i × openInterest_i × 100 × price²) for all strikes.
   * When positive, market makers are net long gamma → stabilising (they
   * sell rallies, buy dips). When negative, they are net short gamma →
   * destabilising (amplifying moves).
   *
   * Note: We do not have market-maker positioning data. We assume market
   * makers are on the short side of retail option purchases (standard
   * assumption). This is an approximation only.
   */
  gexEstimate: number | null;
  gexBias: 'positive' | 'negative' | 'neutral' | 'unknown';

  /**
   * IV skew estimate — heuristic.
   * Computed as: avg IV of OTM puts − avg IV of OTM calls (in the near chain).
   * Positive = put premium (fear bid). Negative = call premium (melt-up bid).
   */
  ivSkewEstimate: number | null;
  skewBias: 'call_premium' | 'put_premium' | 'neutral' | 'unknown';
}

// ── FLOW FEATURES ─────────────────────────────────────────────────────────────

export interface FlowFeatures {
  /**
   * Volume burst detection.
   * A burst is flagged when the latest 1-snapshot volume for a side
   * exceeds 2× the rolling average of the prior N snapshots.
   */
  callVolumeBurst: boolean;
  putVolumeBurst: boolean;
  abnormalActivity: boolean;  // total volume > 3× rolling avg

  /** Aggregate flow bias derived from put/call volume ratio */
  callPutFlowBias: 'call_heavy' | 'put_heavy' | 'balanced' | 'unknown';
  /** 0-1, where 1 = extreme call/put dominance */
  biasStrength: number;

  /**
   * Sweep-like detection heuristic.
   * A "sweep" pattern is inferred when:
   *   - volume spikes >3× avg on one side, AND
   *   - that side's ask > bid by < 5% (tight spread = aggressive fill)
   * This is not a confirmed sweep — it is a flow-pressure indicator.
   */
  callSweepDetected: boolean;
  putSweepDetected: boolean;
  sweepConfidence: number;  // 0-1

  // Running volume averages (from prior wall/flow snapshots in DB)
  avgCallVolume: number | null;
  avgPutVolume: number | null;
}

// ── EXECUTION QUALITY FEATURES ────────────────────────────────────────────────

export interface ExecutionFeatures {
  /** For the nearest-ATM contract of the dominant direction */
  bidAskSpread: number | null;
  spreadPct: number | null;    // (ask − bid) / mid × 100
  spreadQuality: 'tight' | 'normal' | 'wide' | 'very_wide' | 'unknown';

  /**
   * Liquidity score 0-100.
   * Composite of: volume, OI, bid-ask spread, presence of both bid and ask.
   */
  liquidityScore: number;

  slippageRiskLabel: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  quoteQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

// ── COMBINED FEATURES ─────────────────────────────────────────────────────────

export interface SPXFeatures {
  computedAt: string;
  underlying: UnderlyingFeatures;
  chain: OptionsChainFeatures;
  greeks: GreeksFeatures;
  flow: FlowFeatures;
  execution: ExecutionFeatures;
  marketMode: MarketMode;
  sessionType: SessionType;
  /** Indicates data completeness (affects confidence class downstream) */
  dataQuality: 'high' | 'medium' | 'low';
  /** Non-fatal issues encountered during feature computation */
  warnings: string[];
}

// ── WALL ENGINE ────────────────────────────────────────────────────────────────

export type WallState =
  | 'holding'       // wall present, price not near it
  | 'approached'    // price within 0.5% of wall
  | 'rejected'      // price tested wall and reversed
  | 'broken'        // price closed through wall
  | 'unknown';

export interface WallLevel {
  strike: number;
  side: 'call' | 'put';

  /**
   * Wall strength 0-100.
   *
   * FORMULA:
   *   strength = (
   *     0.40 × (strike_oi / max_strike_oi)          ← OI concentration
   *   + 0.30 × (strike_volume / max_strike_volume)  ← Volume concentration
   *   + 0.20 × (near_gamma_sum / total_gamma)       ← Gamma cluster (±5 strikes)
   *   + 0.10 × nearby_reinforcement_bonus           ← Adjacent strike OI ≥ 50% of peak
   *   ) × 100
   */
  strength: number;

  openInterest: number;
  volume: number;
  /** Aggregated gamma for strikes within ±5 pts of this strike */
  gammaCluster: number | null;

  distanceFromPrice: number;   // SPX points
  distancePct: number;         // as % of current price

  /**
   * Persistence score 0-100.
   * Score increases the longer this strike remains the dominant wall.
   *   persistenceScore = min(100, hours_as_dominant_wall × 20)
   * Fully established wall (≥ 5h) = 100.
   */
  persistenceScore: number;

  state: WallState;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface WallEngineOutput {
  computedAt: string;
  underlyingPrice: number;

  /** Primary call wall (strongest above price) */
  callWall: WallLevel | null;
  /** Primary put wall (strongest below price) */
  putWall: WallLevel | null;

  /** The wall (call or put) closest to current price */
  nearestWall: WallLevel | null;
  nearestWallDistance: number | null;   // SPX points

  /** Up to 3 secondary walls per side */
  secondaryCallWalls: WallLevel[];
  secondaryPutWalls: WallLevel[];

  /** True when call_wall and put_wall have migrated since last snapshot */
  wallMigration: boolean;
  migrationDirection: 'higher' | 'lower' | 'none';

  /** True when price is trapped between call wall and put wall (< 30 pts apart) */
  wallCompression: boolean;
  wallCompressionWidth: number | null;

  /** Aggregate wall influence score 0-100 */
  wallScore: number;

  warnings: string[];
}

// ── SHOCK ENGINE ──────────────────────────────────────────────────────────────

export type ShockSeverity = 'none' | 'mild' | 'moderate' | 'severe' | 'extreme';

export interface ShockEngineOutput {
  computedAt: string;
  underlyingPrice: number;

  /**
   * Shock score 0-100: magnitude of current directional price pressure.
   *   = 0.35 × price_velocity_score
   *   + 0.30 × sudden_repricing_score
   *   + 0.20 × flow_burst_score
   *   + 0.15 × gamma_acceleration_score
   */
  shockScore: number;

  /**
   * Acceleration score 0-100: rate-of-change of the shock score itself.
   * High acceleration + high shock = possible institutional-size move.
   */
  accelerationScore: number;

  /** compositeShockScore = 0.6 × shockScore + 0.4 × accelerationScore */
  compositeShockScore: number;

  continuationProbability: number;   // 0-1
  reversalProbability: number;       // 0-1

  severity: ShockSeverity;
  severityLabel: string;

  // Component scores (0-100)
  directionalPressure: number;
  suddenRepricing: number;
  flowBurst: number;
  gammaAcceleration: number;
  exhaustionSignal: number;  // high = possible exhaustion / mean-reversion setup

  /** Human-readable detected patterns */
  patterns: string[];

  // Velocity metrics (points/minute)
  priceVelocity1m: number | null;
  priceVelocity5m: number | null;
  /** Second derivative of price (acceleration in points/min²) */
  acceleration: number | null;

  warnings: string[];
}

// ── SIGNAL SCORING ────────────────────────────────────────────────────────────

export type SignalType =
  | 'BUY_CALL'
  | 'BUY_PUT'
  | 'WATCH_CALL'
  | 'WATCH_PUT'
  | 'NO_TRADE'
  | 'MARKET_UNCLEAR'
  | 'WALL_SHIFT_WARNING'
  | 'FLOW_SURGE_WARNING'
  | 'SHOCK_WARNING'
  | 'REVERSAL_WATCH';

export type SignalMode =
  | 'Trend'
  | 'Trend_Acceleration'
  | 'Breakout'
  | 'Breakdown'
  | 'Reversal'
  | 'Mean_Reversion'
  | 'Momentum_Shock'
  | 'Flow_Expansion'
  | 'Liquidity_Sweep_Recovery'
  | 'Wall_Rejection'
  | 'Wall_Break_Continuation';

/** A = highest confidence, E = lowest */
export type ConfidenceClass = 'A' | 'B' | 'C' | 'D' | 'E';

export type DirectionBias = 'bullish' | 'bearish' | 'neutral';

export interface SignalSubScores {
  /** Trend/range structure quality */
  structure: number;     // 0-100
  /** Options flow quality */
  flow: number;          // 0-100
  /** Gamma environment favourability */
  gamma: number;         // 0-100
  /** Wall context (support/resistance clarity) */
  wall: number;          // 0-100
  /** IV environment (low IV = cheaper options, better R/R) */
  iv: number;            // 0-100
  /** Execution quality (spread, liquidity) */
  execution: number;     // 0-100
  /** Time-of-day / session quality */
  timeContext: number;   // 0-100
  /** Best-available contract appropriateness */
  contractFit: number;   // 0-100
}

export interface SignalOutput {
  /** UUID persisted to spx_signal_events */
  id: string;
  generatedAt: string;
  underlyingPrice: number;

  signalType: SignalType;
  signalMode: SignalMode;
  directionBias: DirectionBias;
  marketMode: MarketMode;

  /**
   * Composite score 0-100.
   * Weighted average of sub-scores:
   *   0.20 × structure + 0.20 × flow + 0.15 × gamma + 0.15 × wall
   * + 0.10 × iv + 0.10 × execution + 0.05 × timeContext + 0.05 × contractFit
   */
  compositeScore: number;
  confidenceClass: ConfidenceClass;

  subScores: SignalSubScores;

  rationale: string;
  keyFactors: string[];
  risks: string[];

  // Recommended contract parameters
  recommendedStrike: number | null;
  recommendedExpiry: string | null;          // YYYY-MM-DD
  recommendedContractType: 'call' | 'put' | null;
  targetPremium: number | null;

  /** Signal should be considered stale after this timestamp */
  expiresAt: string | null;
}

// ── CONTRACT SELECTION ────────────────────────────────────────────────────────

export type ContractRankLabel =
  | 'best'          // highest overall rank score
  | 'backup'        // second-best, more liquid
  | 'aggressive'    // further OTM, higher leverage, lower fill probability
  | 'conservative'; // closer to ATM / ITM, less gamma but higher delta certainty

export interface RankedContract {
  ticker: string;
  strike: number;
  expiry: string;    // YYYY-MM-DD
  optionType: 'call' | 'put';
  dte: number;
  dteRegime: DTERegime;

  // Pricing
  bid: number;
  ask: number;
  mid: number;
  last: number | null;
  spreadPct: number;

  // Chain data
  volume: number;
  openInterest: number;

  // Greeks
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;

  /**
   * Liquidity score 0-100.
   * Composite: volume (30%), OI (25%), spread pct (30%), quote presence (15%).
   */
  liquidityScore: number;

  /**
   * Responsiveness score 0-100.
   * Estimate of how much this contract's premium moves per 1pt SPX move.
   * Derived from |delta| × (1/spread_pct_normalised).
   * Higher delta + tighter spread = more responsive.
   */
  responsivenessScore: number;

  /**
   * Fit score 0-100.
   * How well this contract matches the signal parameters:
   * - Correct DTE regime for signal mode
   * - Delta in preferred range
   * - Premium in tradeable range
   */
  fitScore: number;

  /** Overall rank = 0.35 × liquidity + 0.30 × responsiveness + 0.35 × fit */
  rankScore: number;

  rankLabel: ContractRankLabel;

  /**
   * Estimated leverage: mid_premium / |delta|.
   * Higher = more premium risk per point of underlying move.
   */
  estimatedLeverage: number | null;

  slippageRiskLabel: 'low' | 'medium' | 'high' | 'very_high';
}

export interface ContractRankingOutput {
  generatedAt: string;
  signalId: string | null;
  underlyingPrice: number;
  contractType: 'call' | 'put';

  best: RankedContract | null;
  backup: RankedContract | null;
  aggressive: RankedContract | null;
  conservative: RankedContract | null;

  allCandidates: RankedContract[];

  filterSummary: {
    totalChainContracts: number;
    afterExpiryFilter: number;
    afterDeltaFilter: number;
    afterLiquidityFilter: number;
    afterSpreadFilter: number;
    finalCandidates: number;
  };
}

// ── CONTRACT RANKING CONFIG ───────────────────────────────────────────────────

export interface ContractRankingConfig {
  contractType: 'call' | 'put';
  underlying: string;       // 'SPX' | 'SPXW'
  underlyingPrice: number;
  signalId?: string;

  // Expiry preferences
  expiryPreference: '0DTE' | '1DTE' | 'weekly' | 'any';
  minDTE?: number;
  maxDTE?: number;

  // Greeks filters
  minDelta?: number;   // absolute value (e.g. 0.15)
  maxDelta?: number;   // absolute value (e.g. 0.60)

  // Strike search width — how far from ATM to fetch strikes for calls & puts.
  // Expressed as a fraction of the underlying price (e.g. 0.30 = ATM ±30%).
  // Larger values scan farther OTM/ITM strikes; the delta/liquidity filters
  // still trim the final candidate set.
  strikeBandPct?: number;

  // Quality filters
  maxSpreadPct?: number;   // e.g. 30 = max 30% spread-to-mid ratio
  minOI?: number;
  minVolume?: number;

  // Premium filters
  minPremium?: number;
  maxPremium?: number;

  // Scoring overrides
  minLiquidityScore?: number;  // 0-100
}

// ── ENGINE STATE ──────────────────────────────────────────────────────────────

export interface SPXEngineState {
  isRunning: boolean;
  lastFeatureAt: string | null;
  lastSignalAt: string | null;
  lastWallAt: string | null;
  lastShockAt: string | null;
  underlyingPrice: number | null;
  marketMode: MarketMode | null;
  regimeFlags: {
    is0DTE: boolean;
    is1DTE: boolean;
    isPreMarket: boolean;
    isPostMarket: boolean;
    isWeekend: boolean;
  };
  errorCount: number;
  lastError: string | null;
  updatedAt: string;
}

// ── FULL ENGINE COMPUTE RESULT ────────────────────────────────────────────────

export interface SPXIntelligenceResult {
  features: SPXFeatures;
  walls: WallEngineOutput;
  shock: ShockEngineOutput;
  signal: SignalOutput;
  contracts: ContractRankingOutput | null;
  engineState: SPXEngineState;
  computedAt: string;
}
