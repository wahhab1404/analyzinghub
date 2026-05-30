/**
 * services/spx/intelligence-engine.ts
 *
 * Phase 2 / Phase 3 — SPX Intelligence Engine Orchestrator
 *
 * Orchestrates the full compute pipeline:
 *   1. Feature Extraction  (feature-extractor)
 *   2. Wall Engine         (wall-engine)
 *   3. Shock Engine        (shock-engine)
 *   4. Signal Scoring      (signal-scorer)
 *   5. Contract Ranking    (contract-ranker)
 *   6. Engine State Upsert (spx_engine_state)
 *   7. Alert Dispatch      (spx-telegram) — Phase 3, non-fatal
 *   8. Active Trade Premium Refresh — Phase 3, non-fatal
 *
 * Usage from API routes:
 *   import { runIntelligenceEngine } from '@/services/spx/intelligence-engine';
 *   const result = await runIntelligenceEngine();
 *
 * The engine is stateless per-call. State is persisted to Supabase.
 * For incremental calls, use the individual sub-services directly.
 */

import { createClient } from '@supabase/supabase-js';
import { computeSPXFeatures } from './feature-extractor';
import { computeWallEngine } from './wall-engine';
import { computeShockEngine } from './shock-engine';
import { computeSignal } from './signal-scorer';
import { rankContracts } from './contract-ranker';
import { computeEntryPlan } from './entry-engine';
import {
  sendNewSignalAlert,
  sendShockWarning,
  sendWallBreakAlert,
  sendWallRejectionAlert,
} from './spx-telegram';
// logEngineRun is imported dynamically to avoid circular deps with settings-engine
// which may not exist on first deploy — graceful degradation
let _logEngineRun: ((p: any) => Promise<void>) | null = null;
async function tryLogRun(params: any) {
  try {
    if (!_logEngineRun) {
      const mod = await import('./settings-engine');
      _logEngineRun = mod.logEngineRun;
    }
    await _logEngineRun!(params);
  } catch { /* non-fatal */ }
}
import type {
  SPXIntelligenceResult,
  SPXEngineState,
  ContractRankingConfig,
  SignalOutput,
  SPXFeatures,
  WallEngineOutput,
  ShockEngineOutput,
  ContractRankingOutput,
} from './types';

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── ENGINE STATE HELPERS ──────────────────────────────────────────────────────

async function upsertEngineState(
  state: Partial<Omit<SPXEngineState, 'updatedAt'>>,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('spx_engine_state')
    .upsert({
      id: 'singleton',
      updated_at: new Date().toISOString(),
      is_running: state.isRunning ?? false,
      last_feature_at: state.lastFeatureAt ?? null,
      last_signal_at: state.lastSignalAt ?? null,
      last_wall_at: state.lastWallAt ?? null,
      last_shock_at: state.lastShockAt ?? null,
      underlying_price: state.underlyingPrice ?? null,
      market_mode: state.marketMode ?? null,
      regime_flags: state.regimeFlags ?? null,
      error_count: state.errorCount ?? 0,
      last_error: state.lastError ?? null,
    });
  if (error) console.error('[IntelligenceEngine] State upsert failed:', error.message);
}

export async function getEngineState(): Promise<SPXEngineState> {
  const supabase = getServiceRoleClient();
  const { data } = await supabase
    .from('spx_engine_state')
    .select('*')
    .eq('id', 'singleton')
    .single();

  if (!data) {
    return {
      isRunning: false,
      lastFeatureAt: null,
      lastSignalAt: null,
      lastWallAt: null,
      lastShockAt: null,
      underlyingPrice: null,
      marketMode: null,
      regimeFlags: {
        is0DTE: false,
        is1DTE: false,
        isPreMarket: false,
        isPostMarket: false,
        isWeekend: false,
      },
      errorCount: 0,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    isRunning: data.is_running ?? false,
    lastFeatureAt: data.last_feature_at ?? null,
    lastSignalAt: data.last_signal_at ?? null,
    lastWallAt: data.last_wall_at ?? null,
    lastShockAt: data.last_shock_at ?? null,
    underlyingPrice: data.underlying_price ?? null,
    marketMode: data.market_mode ?? null,
    regimeFlags: data.regime_flags ?? {
      is0DTE: false,
      is1DTE: false,
      isPreMarket: false,
      isPostMarket: false,
      isWeekend: false,
    },
    errorCount: data.error_count ?? 0,
    lastError: data.last_error ?? null,
    updatedAt: data.updated_at ?? new Date().toISOString(),
  };
}

// ── CONTRACT RANKING CONFIG FROM SIGNAL ───────────────────────────────────────

function buildRankingConfig(
  signal: SignalOutput,
  features: SPXFeatures,
): ContractRankingConfig | null {
  if (!signal.recommendedContractType) return null;

  const isShockSignal =
    signal.signalMode === 'Momentum_Shock' ||
    signal.signalMode === 'Trend_Acceleration';

  return {
    contractType: signal.recommendedContractType,
    underlying: 'SPX',
    underlyingPrice: features.underlying.price,
    signalId: signal.id,
    expiryPreference: features.chain.is0DTE ? '0DTE' : features.chain.is1DTE ? '1DTE' : 'weekly',
    minDTE: 0,
    maxDTE: features.chain.is0DTE ? 0 : 7,
    minDelta: isShockSignal ? 0.20 : 0.15,   // slightly wider for shock/acceleration plays
    maxDelta: isShockSignal ? 0.55 : 0.60,
    maxSpreadPct: features.chain.is0DTE ? 40 : 30,
    minOI: features.chain.is0DTE ? 100 : 500,
    minVolume: features.chain.is0DTE ? 50 : 100,
    minLiquidityScore: 20,
  };
}

// ── FULL ENGINE RUN ───────────────────────────────────────────────────────────

export interface RunOptions {
  /** Skip contract ranking (faster, use when only features/signal needed) */
  skipContractRanking?: boolean;
  /** Skip wall engine (faster, use for rapid signal refreshes) */
  skipWalls?: boolean;
}

export async function runIntelligenceEngine(
  options: RunOptions = {},
): Promise<SPXIntelligenceResult> {
  const now = new Date().toISOString();
  const startMs = Date.now();
  let errorCount = 0;
  let lastError: string | null = null;

  // Mark running
  await upsertEngineState({ isRunning: true });

  let features: SPXFeatures | null = null;
  let walls: WallEngineOutput | null = null;
  let shock: ShockEngineOutput | null = null;
  let signal: SignalOutput | null = null;
  let contracts: ContractRankingOutput | null = null;

  // ── 1. FEATURE EXTRACTION ────────────────────────────────────────────────
  try {
    features = await computeSPXFeatures();
    await upsertEngineState({
      isRunning: true,
      lastFeatureAt: new Date().toISOString(),
      underlyingPrice: features.underlying.price,
      marketMode: features.marketMode,
      regimeFlags: {
        is0DTE: features.chain.is0DTE,
        is1DTE: features.chain.is1DTE,
        isPreMarket: features.sessionType === 'pre_market',
        isPostMarket: features.sessionType === 'after_hours',
        isWeekend: features.sessionType === 'weekend',
      },
    });
  } catch (err: any) {
    lastError = `Feature extraction failed: ${err.message}`;
    errorCount++;
    console.error('[IntelligenceEngine]', lastError);
    await upsertEngineState({ isRunning: false, errorCount, lastError });
    await tryLogRun({ durationMs: Date.now() - startMs, success: false, errorMsg: lastError });
    throw new Error(lastError);
  }

  // ── 2. WALL ENGINE ───────────────────────────────────────────────────────
  if (!options.skipWalls) {
    try {
      walls = await computeWallEngine(features.underlying.price);
      await upsertEngineState({
        isRunning: true,
        lastWallAt: new Date().toISOString(),
      });
    } catch (err: any) {
      lastError = `Wall engine failed: ${err.message}`;
      errorCount++;
      console.warn('[IntelligenceEngine]', lastError);
      // Wall failure is non-fatal — continue with empty walls
      walls = {
        computedAt: now,
        underlyingPrice: features.underlying.price,
        callWall: null,
        putWall: null,
        nearestWall: null,
        nearestWallDistance: null,
        secondaryCallWalls: [],
        secondaryPutWalls: [],
        wallMigration: false,
        migrationDirection: 'none',
        wallCompression: false,
        wallCompressionWidth: null,
        wallScore: 0,
        warnings: [lastError],
      };
    }
  } else {
    walls = {
      computedAt: now,
      underlyingPrice: features.underlying.price,
      callWall: null, putWall: null, nearestWall: null, nearestWallDistance: null,
      secondaryCallWalls: [], secondaryPutWalls: [],
      wallMigration: false, migrationDirection: 'none',
      wallCompression: false, wallCompressionWidth: null,
      wallScore: 0, warnings: ['Wall engine skipped'],
    };
  }

  // ── 3. SHOCK ENGINE ──────────────────────────────────────────────────────
  try {
    shock = await computeShockEngine(features, walls);
    await upsertEngineState({
      isRunning: true,
      lastShockAt: new Date().toISOString(),
    });
  } catch (err: any) {
    lastError = `Shock engine failed: ${err.message}`;
    errorCount++;
    console.warn('[IntelligenceEngine]', lastError);
    // Shock failure is non-fatal
    shock = {
      computedAt: now,
      underlyingPrice: features.underlying.price,
      shockScore: 0, accelerationScore: 0, compositeShockScore: 0,
      continuationProbability: 0.5, reversalProbability: 0.5,
      severity: 'none', severityLabel: 'Normal',
      directionalPressure: 0, suddenRepricing: 0, flowBurst: 0,
      gammaAcceleration: 0, exhaustionSignal: 0,
      patterns: [], priceVelocity1m: null, priceVelocity5m: null,
      acceleration: null, warnings: [lastError],
    };
  }

  // ── 4. SIGNAL SCORING ────────────────────────────────────────────────────
  try {
    signal = await computeSignal(features, walls, shock);
    await upsertEngineState({
      isRunning: true,
      lastSignalAt: new Date().toISOString(),
    });
  } catch (err: any) {
    lastError = `Signal scoring failed: ${err.message}`;
    errorCount++;
    console.error('[IntelligenceEngine]', lastError);
    await upsertEngineState({ isRunning: false, errorCount, lastError });
    await tryLogRun({ durationMs: Date.now() - startMs, success: false, errorMsg: lastError, spxPrice: features?.underlying?.price });
    throw new Error(lastError);
  }

  // ── 5. CONTRACT RANKING ──────────────────────────────────────────────────
  if (!options.skipContractRanking) {
    try {
      const rankConfig = buildRankingConfig(signal, features);
      if (rankConfig) {
        contracts = await rankContracts(rankConfig);
        // Update signal with best contract's premium
        if (contracts.best && signal) {
          (signal as any).targetPremium = contracts.best.mid;
        }
      }
    } catch (err: any) {
      lastError = `Contract ranking failed: ${err.message}`;
      errorCount++;
      console.warn('[IntelligenceEngine]', lastError);
      // Non-fatal
    }
  }

  // ── 6. FINAL STATE UPDATE ────────────────────────────────────────────────
  const engineState = await getEngineState();
  await upsertEngineState({
    isRunning: false,
    errorCount,
    lastError,
  });

  // ── 7. PHASE 3: ALERT DISPATCH ────────────────────────────────────────────────────────────
  // Non-fatal: alert failures never crash the engine

  try {
    // Only alert for actionable signals (not NO_TRADE, MARKET_UNCLEAR)
    const actionableTypes = ['BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT', 'WALL_SHIFT_WARNING', 'FLOW_SURGE_WARNING', 'SHOCK_WARNING', 'REVERSAL_WATCH'];

    if (signal && actionableTypes.includes(signal.signalType)) {
      const entryPlan = contracts?.best
        ? computeEntryPlan(signal, features, contracts.best, walls, shock)
        : null;
      await sendNewSignalAlert(signal, features, walls, contracts, entryPlan);
    }

    // Shock warning if moderate+
    if (shock && ['moderate', 'severe', 'extreme'].includes(shock.severity)) {
      await sendShockWarning(shock, features);
    }

    // Wall break/rejection alerts
    if (walls) {
      if (walls.callWall?.state === 'broken' || walls.putWall?.state === 'broken') {
        await sendWallBreakAlert(walls, features);
      }
      if (walls.callWall?.state === 'rejected' || walls.putWall?.state === 'rejected') {
        await sendWallRejectionAlert(walls, features);
      }
    }
  } catch (alertErr: any) {
    console.warn('[IntelligenceEngine] Alert dispatch failed:', alertErr.message);
  }

  // ── 7b. PHASE 5: AUTO-TRADE SELECTION ────────────────────────────────────
  // Non-fatal: any failure here logs and continues.
  try {
    const { runAutoTradeSelector } = await import('./auto-trade-selector');
    const { getSettings } = await import('./settings-engine');
    const settings = await getSettings();
    const autoResult = await runAutoTradeSelector(
      { features, walls, shock, signal, contracts, engineState, computedAt: new Date().toISOString() },
      settings,
    );
    if (autoResult.created) {
      console.info(`[IntelligenceEngine] Auto-trade created: ${autoResult.tradeId} (${autoResult.channelsSent} channels)`);
    } else if (!['auto_trade_disabled', 'not_buy_signal', 'duplicate:auto_trade_exists'].includes(autoResult.reason)) {
      console.info(`[IntelligenceEngine] Auto-trade skipped: ${autoResult.reason}`);
    }
  } catch (autoErr: any) {
    console.warn('[IntelligenceEngine] Auto-trade flow failed:', autoErr.message);
  }

  // ── 8. PHASE 3: REFRESH ACTIVE TRADE PREMIUMS ─────────────────────────────
  // For each active trade, fetch current premium from Polygon and update DB
  // Non-fatal

  try {
    const { refreshActiveTradePremiums } = await import('./trade-engine');
    await refreshActiveTradePremiums(features.underlying.price);
  } catch (tradeErr: any) {
    console.warn('[IntelligenceEngine] Trade premium refresh failed:', tradeErr.message);
  }

  // ── 9. LOG ENGINE RUN ───────────────────────────────────────────────────────
  await tryLogRun({
    durationMs: Date.now() - startMs,
    success: errorCount === 0,
    signalType: signal?.signalType,
    marketMode: features?.marketMode,
    spxPrice: features?.underlying?.price,
    errorMsg: lastError ?? undefined,
    dataQuality: features?.dataQuality,
  });

  return {
    features,
    walls,
    shock,
    signal,
    contracts,
    engineState: { ...engineState, isRunning: false },
    computedAt: new Date().toISOString(),
  };
}
