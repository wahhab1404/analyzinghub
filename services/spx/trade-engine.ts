/**
 * services/spx/trade-engine.ts
 *
 * Phase 3 — SPX Trade Lifecycle Engine
 *
 * Manages the full lifecycle of an SPX options trade through a state machine:
 *   detected → candidate → confirmed → alerted → entered → active
 *     → partially_exited → closed_win | closed_loss | expired
 *   Any state → invalidated | cancelled
 *
 * All DB access uses the service role client (bypasses RLS).
 * State transitions and premium refreshes are called from the intelligence
 * engine orchestrator after each compute cycle.
 */

import { createClient } from '@supabase/supabase-js';
import type {
  SignalOutput,
  SPXFeatures,
  ContractRankingOutput,
} from './types';

// ── CLIENT ────────────────────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── EXPORTED TYPES ────────────────────────────────────────────────────────────

export type TradeState =
  | 'detected'
  | 'candidate'
  | 'confirmed'
  | 'alerted'
  | 'entered'
  | 'active'
  | 'partially_exited'
  | 'closed_win'
  | 'closed_loss'
  | 'expired'
  | 'invalidated'
  | 'cancelled';

export type FinalScoreOutcome =
  | 'big_win'
  | 'small_win'
  | 'breakeven'
  | 'small_loss'
  | 'big_loss';

export interface SPXTrade {
  id: string;
  createdAt: string;
  updatedAt: string;
  signalEventId: string | null;
  isAuto: boolean;
  autoChannelIds: string[];
  alertSentAt: string | null;
  contractCandidateId: string | null;
  ticker: string | null;
  strike: number | null;
  expiry: string | null;       // DATE as ISO string YYYY-MM-DD
  optionType: 'call' | 'put' | null;
  dte: number | null;
  state: TradeState;
  entryTimestamp: string | null;
  entryPremium: number | null;
  entrySpxPrice: number | null;
  suggestedEntryLow: number | null;
  suggestedEntryHigh: number | null;
  currentPremium: number | null;
  currentSpxPrice: number | null;
  premiumUpdatedAt: string | null;
  highestPremium: number | null;
  lowestPremium: number | null;
  highestPremiumAt: string | null;
  lowestPremiumAt: string | null;
  stopPremium: number | null;
  hardStopSpx: number | null;
  softStopConditions: string[];
  target1Premium: number | null;
  target2Premium: number | null;
  target3Premium: number | null;
  runnerPremium: number | null;
  timeStopAt: string | null;
  mfe: number | null;
  mae: number | null;
  realizedPnlPct: number | null;
  unrealizedPnlPct: number | null;
  exitTimestamp: string | null;
  exitPremium: number | null;
  exitSpxPrice: number | null;
  exitReason: string | null;
  finalScoreOutcome: FinalScoreOutcome | null;
  compositeScore: number | null;
  confidenceClass: string | null;
  signalMode: string | null;
  directionBias: string | null;
  invalidationNotes: string[];
  metadata: Record<string, any> | null;
  // Phase 5 — auto-trade fields (optional / nullable)
  isAuto?: boolean;
  autoChannelIds?: string[];
  alertSentAt?: string | null;
  lastTargetAlerted?: number;
}

// ── ROW → TRADE MAPPER ────────────────────────────────────────────────────────

/**
 * Maps a raw Supabase DB row (snake_case) to the SPXTrade interface (camelCase).
 * Handles null coercion and array defaults.
 */
function rowToTrade(row: Record<string, any>): SPXTrade {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signalEventId: row.signal_event_id ?? null,
    isAuto: row.is_auto ?? false,
    autoChannelIds: Array.isArray(row.auto_channel_ids) ? row.auto_channel_ids : [],
    alertSentAt: row.alert_sent_at ?? null,
    contractCandidateId: row.contract_candidate_id ?? null,
    ticker: row.ticker ?? null,
    strike: row.strike !== null && row.strike !== undefined ? Number(row.strike) : null,
    expiry: row.expiry ?? null,
    optionType: row.option_type ?? null,
    dte: row.dte !== null && row.dte !== undefined ? Number(row.dte) : null,
    state: row.state as TradeState,
    entryTimestamp: row.entry_timestamp ?? null,
    entryPremium: row.entry_premium !== null && row.entry_premium !== undefined
      ? Number(row.entry_premium) : null,
    entrySpxPrice: row.entry_spx_price !== null && row.entry_spx_price !== undefined
      ? Number(row.entry_spx_price) : null,
    suggestedEntryLow: row.suggested_entry_low !== null && row.suggested_entry_low !== undefined
      ? Number(row.suggested_entry_low) : null,
    suggestedEntryHigh: row.suggested_entry_high !== null && row.suggested_entry_high !== undefined
      ? Number(row.suggested_entry_high) : null,
    currentPremium: row.current_premium !== null && row.current_premium !== undefined
      ? Number(row.current_premium) : null,
    currentSpxPrice: row.current_spx_price !== null && row.current_spx_price !== undefined
      ? Number(row.current_spx_price) : null,
    premiumUpdatedAt: row.premium_updated_at ?? null,
    highestPremium: row.highest_premium !== null && row.highest_premium !== undefined
      ? Number(row.highest_premium) : null,
    lowestPremium: row.lowest_premium !== null && row.lowest_premium !== undefined
      ? Number(row.lowest_premium) : null,
    highestPremiumAt: row.highest_premium_at ?? null,
    lowestPremiumAt: row.lowest_premium_at ?? null,
    stopPremium: row.stop_premium !== null && row.stop_premium !== undefined
      ? Number(row.stop_premium) : null,
    hardStopSpx: row.hard_stop_spx !== null && row.hard_stop_spx !== undefined
      ? Number(row.hard_stop_spx) : null,
    softStopConditions: Array.isArray(row.soft_stop_conditions) ? row.soft_stop_conditions : [],
    target1Premium: row.target_1_premium !== null && row.target_1_premium !== undefined
      ? Number(row.target_1_premium) : null,
    target2Premium: row.target_2_premium !== null && row.target_2_premium !== undefined
      ? Number(row.target_2_premium) : null,
    target3Premium: row.target_3_premium !== null && row.target_3_premium !== undefined
      ? Number(row.target_3_premium) : null,
    runnerPremium: row.runner_premium !== null && row.runner_premium !== undefined
      ? Number(row.runner_premium) : null,
    timeStopAt: row.time_stop_at ?? null,
    mfe: row.mfe !== null && row.mfe !== undefined ? Number(row.mfe) : null,
    mae: row.mae !== null && row.mae !== undefined ? Number(row.mae) : null,
    realizedPnlPct: row.realized_pnl_pct !== null && row.realized_pnl_pct !== undefined
      ? Number(row.realized_pnl_pct) : null,
    unrealizedPnlPct: row.unrealized_pnl_pct !== null && row.unrealized_pnl_pct !== undefined
      ? Number(row.unrealized_pnl_pct) : null,
    exitTimestamp: row.exit_timestamp ?? null,
    exitPremium: row.exit_premium !== null && row.exit_premium !== undefined
      ? Number(row.exit_premium) : null,
    exitSpxPrice: row.exit_spx_price !== null && row.exit_spx_price !== undefined
      ? Number(row.exit_spx_price) : null,
    exitReason: row.exit_reason ?? null,
    finalScoreOutcome: row.final_score_outcome ?? null,
    compositeScore: row.composite_score !== null && row.composite_score !== undefined
      ? Number(row.composite_score) : null,
    confidenceClass: row.confidence_class ?? null,
    signalMode: row.signal_mode ?? null,
    directionBias: row.direction_bias ?? null,
    invalidationNotes: Array.isArray(row.invalidation_notes) ? row.invalidation_notes : [],
    metadata: row.metadata ?? null,
    isAuto: row.is_auto ?? false,
    autoChannelIds: Array.isArray(row.auto_channel_ids) ? row.auto_channel_ids : [],
    alertSentAt: row.alert_sent_at ?? null,
    lastTargetAlerted: row.last_target_alerted ?? 0,
  };
}

// ── Phase 5: AUTO-TRADE LIFECYCLE ──────────────────────────────────────────
async function processAutoTradeLifecycle(
  trade: SPXTrade,
  currentPremium: number,
  currentSpxPrice: number,
  getDispatcher: () => Promise<typeof import('./auto-trade-dispatcher')>,
): Promise<void> {
  try {
    const lastTarget = trade.lastTargetAlerted ?? 0;
    const stop = trade.stopPremium;
    const t1 = trade.target1Premium;
    const t2 = trade.target2Premium;
    const t3 = trade.target3Premium;
    const dispatcher = await getDispatcher();

    // 1) STOP hit — close trade and alert
    if (stop != null && currentPremium <= stop && trade.state !== 'closed_loss' && trade.state !== 'closed_win') {
      await closeTrade(trade.id, currentPremium, currentSpxPrice, 'auto_stop_hit');
      const updated = (await getTradeById(trade.id)) ?? trade;
      await dispatcher.dispatchAutoTradeStop(updated, currentPremium);
      await dispatcher.dispatchAutoTradeClosed(updated);
      return;
    }

    // 2) Target hits (ascending) — only fire when crossing fresh targets
    if (lastTarget < 1 && t1 != null && currentPremium >= t1) {
      await dispatcher.dispatchAutoTradeTarget(trade, 1, currentPremium);
    }
    if (lastTarget < 2 && t2 != null && currentPremium >= t2) {
      await dispatcher.dispatchAutoTradeTarget(trade, 2, currentPremium);
    }
    if (lastTarget < 3 && t3 != null && currentPremium >= t3) {
      await dispatcher.dispatchAutoTradeTarget(trade, 3, currentPremium);
      // Treat T3 as the natural close
      await closeTrade(trade.id, currentPremium, currentSpxPrice, 'auto_target3_hit');
      const updated = (await getTradeById(trade.id)) ?? trade;
      await dispatcher.dispatchAutoTradeClosed(updated);
    }
  } catch (err: any) {
    console.warn(`[TradeEngine] processAutoTradeLifecycle(${trade.id}) failed:`, err.message);
  }
}

// ── ACTIVE STATES ─────────────────────────────────────────────────────────────

/** States that represent a live / in-progress trade requiring ongoing monitoring. */
const ACTIVE_STATES: TradeState[] = [
  'detected',
  'candidate',
  'confirmed',
  'alerted',
  'entered',
  'active',
  'partially_exited',
];

/** States eligible for live premium refresh via Polygon. */
const PREMIUM_REFRESH_STATES: TradeState[] = ['confirmed', 'entered', 'active', 'partially_exited'];

// ── PUBLIC API ─────────────────────────────────────────────────────────────────

/**
 * Create a new trade row in the 'detected' state from a scored signal.
 *
 * Uses the best-ranked contract (if available) to populate contract identity
 * fields (ticker, strike, expiry, optionType, dte). Entry plan and stop/target
 * levels are NOT computed here — those are set when the trade reaches
 * 'confirmed' state via computeEntryPlan() in entry-engine.ts.
 *
 * @param signal  The SignalOutput from the signal scorer.
 * @param features  The full SPXFeatures snapshot at the time of signal generation.
 * @param contracts  The ContractRankingOutput (may be null if ranking failed).
 * @returns The newly created SPXTrade, or null if the DB insert failed.
 */
export async function createTradeFromSignal(
  signal: SignalOutput,
  features: SPXFeatures,
  contracts: ContractRankingOutput | null,
): Promise<SPXTrade | null> {
  const supabase = getServiceRoleClient();

  // Use best-ranked contract if available, otherwise fall back to signal recommendation
  const best = contracts?.best ?? null;

  const insertRow: Record<string, any> = {
    signal_event_id: signal.id,
    state: 'detected',

    // Contract identity from best contract (or signal recommendation)
    ticker: best?.ticker ?? null,
    strike: best?.strike ?? signal.recommendedStrike ?? null,
    expiry: best?.expiry ?? signal.recommendedExpiry ?? null,
    option_type: best?.optionType ?? signal.recommendedContractType ?? null,
    dte: best?.dte ?? null,

    // Signal context snapshot (denormalised for fast reads without JOIN)
    composite_score: signal.compositeScore,
    confidence_class: signal.confidenceClass,
    signal_mode: signal.signalMode,
    direction_bias: signal.directionBias,

    // Initialise premium tracking with the recommended/best mid price
    current_premium: best?.mid ?? signal.targetPremium ?? null,
    current_spx_price: signal.underlyingPrice,
    premium_updated_at: signal.generatedAt,

    // Initialise premium extremes with current premium when available
    highest_premium: best?.mid ?? signal.targetPremium ?? null,
    lowest_premium: best?.mid ?? signal.targetPremium ?? null,
    highest_premium_at: best?.mid != null ? signal.generatedAt : null,
    lowest_premium_at: best?.mid != null ? signal.generatedAt : null,

    // Soft stop conditions start empty — populated at confirmed state
    soft_stop_conditions: [],
    invalidation_notes: [],

    // Store enriched context for debugging and future analytics
    metadata: {
      signalType: signal.signalType,
      signalRationale: signal.rationale,
      keyFactors: signal.keyFactors,
      risks: signal.risks,
      subScores: signal.subScores,
      marketMode: features.marketMode,
      sessionType: features.sessionType,
      dataQuality: features.dataQuality,
      underlyingPrice: signal.underlyingPrice,
      contractRankLabel: best?.rankLabel ?? null,
      contractRankScore: best?.rankScore ?? null,
      contractLiquidityScore: best?.liquidityScore ?? null,
      contractCandidateId: contracts?.best != null ? (best as any)?.id ?? null : null,
      warnings: [...(features.warnings ?? [])],
    },
  };

  const { data, error } = await supabase
    .from('spx_trades')
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    console.error('[TradeEngine] createTradeFromSignal failed:', error.message);
    return null;
  }

  return rowToTrade(data);
}

/**
 * Advance (or change) the state of a trade and optionally update supplemental
 * fields in the same DB write.
 *
 * This is the primary state-machine transition function.  All callers must pass
 * a valid TradeState for newState; no guard rails are enforced here — the
 * calling orchestrator is responsible for valid transition sequences.
 *
 * @param tradeId   UUID of the trade to update.
 * @param newState  The target TradeState.
 * @param extra     Optional fields to set alongside the state change (e.g. entry
 *                  price when moving to 'entered', or exit data when closing).
 */
export async function updateTradeState(
  tradeId: string,
  newState: TradeState,
  extra?: Partial<Pick<SPXTrade,
    | 'entryPremium'
    | 'entrySpxPrice'
    | 'entryTimestamp'
    | 'exitPremium'
    | 'exitSpxPrice'
    | 'exitTimestamp'
    | 'exitReason'
    | 'finalScoreOutcome'
    | 'stopPremium'
    | 'hardStopSpx'
    | 'target1Premium'
    | 'target2Premium'
    | 'target3Premium'
    | 'runnerPremium'
    | 'timeStopAt'
    | 'suggestedEntryLow'
    | 'suggestedEntryHigh'
    | 'softStopConditions'
  >>,
): Promise<void> {
  const supabase = getServiceRoleClient();

  const updateRow: Record<string, any> = {
    state: newState,
    updated_at: new Date().toISOString(),
  };

  // Map camelCase extra fields to snake_case DB columns
  if (extra) {
    if (extra.entryPremium !== undefined)      updateRow.entry_premium        = extra.entryPremium;
    if (extra.entrySpxPrice !== undefined)     updateRow.entry_spx_price      = extra.entrySpxPrice;
    if (extra.entryTimestamp !== undefined)    updateRow.entry_timestamp      = extra.entryTimestamp;
    if (extra.exitPremium !== undefined)       updateRow.exit_premium         = extra.exitPremium;
    if (extra.exitSpxPrice !== undefined)      updateRow.exit_spx_price       = extra.exitSpxPrice;
    if (extra.exitTimestamp !== undefined)     updateRow.exit_timestamp       = extra.exitTimestamp;
    if (extra.exitReason !== undefined)        updateRow.exit_reason          = extra.exitReason;
    if (extra.finalScoreOutcome !== undefined) updateRow.final_score_outcome  = extra.finalScoreOutcome;
    if (extra.stopPremium !== undefined)       updateRow.stop_premium         = extra.stopPremium;
    if (extra.hardStopSpx !== undefined)       updateRow.hard_stop_spx        = extra.hardStopSpx;
    if (extra.target1Premium !== undefined)    updateRow.target_1_premium     = extra.target1Premium;
    if (extra.target2Premium !== undefined)    updateRow.target_2_premium     = extra.target2Premium;
    if (extra.target3Premium !== undefined)    updateRow.target_3_premium     = extra.target3Premium;
    if (extra.runnerPremium !== undefined)     updateRow.runner_premium       = extra.runnerPremium;
    if (extra.timeStopAt !== undefined)        updateRow.time_stop_at         = extra.timeStopAt;
    if (extra.suggestedEntryLow !== undefined) updateRow.suggested_entry_low  = extra.suggestedEntryLow;
    if (extra.suggestedEntryHigh !== undefined) updateRow.suggested_entry_high = extra.suggestedEntryHigh;
    if (extra.softStopConditions !== undefined) updateRow.soft_stop_conditions = extra.softStopConditions;
  }

  const { error } = await supabase
    .from('spx_trades')
    .update(updateRow)
    .eq('id', tradeId);

  if (error) {
    console.error(`[TradeEngine] updateTradeState(${tradeId} → ${newState}) failed:`, error.message);
  }
}

/**
 * Refresh the live premium snapshot for an active trade and recompute
 * MFE, MAE, and unrealized P/L.
 *
 * Called after each intelligence engine compute cycle for all trades in
 * ACTIVE_STATES. Safe to call even if entryPremium is not yet set (the
 * P/L / MFE / MAE fields will simply not update in that case).
 *
 * @param tradeId         UUID of the trade to refresh.
 * @param currentPremium  The latest mid-price of the contract.
 * @param currentSpxPrice The latest SPX underlying price.
 */
export async function refreshTradePremium(
  tradeId: string,
  currentPremium: number,
  currentSpxPrice: number,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  // Fetch the current trade row to get existing extremes and entry premium
  const { data: row, error: fetchError } = await supabase
    .from('spx_trades')
    .select(
      'entry_premium, highest_premium, lowest_premium, highest_premium_at, lowest_premium_at',
    )
    .eq('id', tradeId)
    .single();

  if (fetchError || !row) {
    console.error(`[TradeEngine] refreshTradePremium fetch(${tradeId}) failed:`,
      fetchError?.message ?? 'no row');
    return;
  }

  const entryPremium: number | null = row.entry_premium !== null && row.entry_premium !== undefined
    ? Number(row.entry_premium) : null;
  const prevHighest: number | null = row.highest_premium !== null && row.highest_premium !== undefined
    ? Number(row.highest_premium) : null;
  const prevLowest: number | null = row.lowest_premium !== null && row.lowest_premium !== undefined
    ? Number(row.lowest_premium) : null;

  const updateRow: Record<string, any> = {
    current_premium: currentPremium,
    current_spx_price: currentSpxPrice,
    premium_updated_at: now,
    updated_at: now,
  };

  // Update highest premium if current exceeds previous high (or no high yet)
  if (prevHighest === null || currentPremium > prevHighest) {
    updateRow.highest_premium = currentPremium;
    updateRow.highest_premium_at = now;
  }

  // Update lowest premium if current is below previous low (or no low yet)
  if (prevLowest === null || currentPremium < prevLowest) {
    updateRow.lowest_premium = currentPremium;
    updateRow.lowest_premium_at = now;
  }

  // Compute entry-relative metrics only when we have a confirmed entry
  if (entryPremium !== null && entryPremium > 0) {
    // Unrealized P/L % = (current − entry) / entry × 100
    updateRow.unrealized_pnl_pct = ((currentPremium - entryPremium) / entryPremium) * 100;

    // MFE: best-case gain from entry to highest point (clamped to 0 minimum)
    const effectiveHigh = updateRow.highest_premium ?? prevHighest ?? currentPremium;
    updateRow.mfe = Math.max(0, ((effectiveHigh - entryPremium) / entryPremium) * 100);

    // MAE: worst-case loss from entry to lowest point (clamped to 0 minimum)
    const effectiveLow = updateRow.lowest_premium ?? prevLowest ?? currentPremium;
    updateRow.mae = Math.max(0, ((entryPremium - effectiveLow) / entryPremium) * 100);
  }

  const { error } = await supabase
    .from('spx_trades')
    .update(updateRow)
    .eq('id', tradeId);

  if (error) {
    console.error(`[TradeEngine] refreshTradePremium update(${tradeId}) failed:`, error.message);
  }
}

/**
 * Close a trade by computing realized P/L, classifying the outcome, and
 * transitioning to 'closed_win' or 'closed_loss'.
 *
 * Final score classification thresholds:
 *   >= +50%  →  big_win
 *   >= +15%  →  small_win
 *   >= -10%  →  breakeven
 *   >= -30%  →  small_loss
 *   <  -30%  →  big_loss
 *
 * @param tradeId       UUID of the trade to close.
 * @param exitPremium   The actual (or estimated) fill price at exit.
 * @param exitSpxPrice  SPX underlying price at the time of exit.
 * @param exitReason    Human-readable description of why the trade was closed.
 */
export async function closeTrade(
  tradeId: string,
  exitPremium: number,
  exitSpxPrice: number,
  exitReason: string,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  // Fetch entry premium to compute P/L
  const { data: row, error: fetchError } = await supabase
    .from('spx_trades')
    .select('entry_premium')
    .eq('id', tradeId)
    .single();

  if (fetchError || !row) {
    console.error(`[TradeEngine] closeTrade fetch(${tradeId}) failed:`,
      fetchError?.message ?? 'no row');
    return;
  }

  const entryPremium: number | null = row.entry_premium !== null && row.entry_premium !== undefined
    ? Number(row.entry_premium) : null;

  let realizedPnlPct: number | null = null;
  let finalScoreOutcome: FinalScoreOutcome | null = null;
  let newState: TradeState = 'closed_loss';

  if (entryPremium !== null && entryPremium > 0) {
    realizedPnlPct = ((exitPremium - entryPremium) / entryPremium) * 100;

    // Classify outcome
    if (realizedPnlPct >= 50) {
      finalScoreOutcome = 'big_win';
    } else if (realizedPnlPct >= 15) {
      finalScoreOutcome = 'small_win';
    } else if (realizedPnlPct >= -10) {
      finalScoreOutcome = 'breakeven';
    } else if (realizedPnlPct >= -30) {
      finalScoreOutcome = 'small_loss';
    } else {
      finalScoreOutcome = 'big_loss';
    }

    newState = realizedPnlPct > 0 ? 'closed_win' : 'closed_loss';
  }

  const { error } = await supabase
    .from('spx_trades')
    .update({
      state: newState,
      exit_timestamp: now,
      exit_premium: exitPremium,
      exit_spx_price: exitSpxPrice,
      exit_reason: exitReason,
      realized_pnl_pct: realizedPnlPct,
      final_score_outcome: finalScoreOutcome,
      unrealized_pnl_pct: null,   // clear unrealized once realized is set
      updated_at: now,
    })
    .eq('id', tradeId);

  if (error) {
    console.error(`[TradeEngine] closeTrade update(${tradeId}) failed:`, error.message);
  }
}

/**
 * Retrieve all trades that are currently in an active/monitored state.
 *
 * Active states: 'detected', 'candidate', 'confirmed', 'alerted',
 * 'entered', 'active', 'partially_exited'.
 *
 * @returns Array of SPXTrade objects in any active state, ordered by
 *          created_at DESC. Returns empty array on error.
 */
export async function getActiveTrades(): Promise<SPXTrade[]> {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from('spx_trades')
    .select('*')
    .in('state', ACTIVE_STATES)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[TradeEngine] getActiveTrades failed:', error.message);
    return [];
  }

  return (data ?? []).map(rowToTrade);
}

/**
 * Retrieve a single trade by its UUID.
 *
 * @param tradeId  UUID of the trade to fetch.
 * @returns The SPXTrade or null if not found or on error.
 */
export async function getTradeById(tradeId: string): Promise<SPXTrade | null> {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from('spx_trades')
    .select('*')
    .eq('id', tradeId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      // PGRST116 = no rows found, not a real error
      console.error(`[TradeEngine] getTradeById(${tradeId}) failed:`, error.message);
    }
    return null;
  }

  return data ? rowToTrade(data) : null;
}

/**
 * Retrieve the most recent trades across all states, with optional state filter.
 *
 * Useful for history panels, analytics, and outcome review.
 *
 * @param limit        Maximum number of trades to return. Defaults to 50.
 * @param stateFilter  Optional TradeState to filter results.
 * @returns Array of SPXTrade objects ordered by created_at DESC.
 */
export async function getRecentTrades(
  limit: number = 50,
  stateFilter?: TradeState,
): Promise<SPXTrade[]> {
  const supabase = getServiceRoleClient();

  let query = supabase
    .from('spx_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (stateFilter) {
    query = query.eq('state', stateFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[TradeEngine] getRecentTrades failed:', error.message);
    return [];
  }

  return (data ?? []).map(rowToTrade);
}

/**
 * For all active trades that have a ticker, fetch current premium from Polygon
 * and call refreshTradePremium for each.
 *
 * Fetches the option snapshot from Polygon REST:
 *   GET /v3/snapshot/options/{underlying}?ticker.any_of={tickers}&apiKey=...
 *
 * Uses mid price = (bid + ask) / 2 when both are present, otherwise falls
 * back to last trade price.
 *
 * @param currentSpxPrice  The current SPX underlying price from this engine cycle.
 */
export async function refreshActiveTradePremiums(currentSpxPrice: number): Promise<void> {
  const activeTrades = await getActiveTrades();

  // Filter to trades in premium-refresh eligible states that have a ticker
  const eligibleTrades = activeTrades.filter(
    (t) => t.ticker && PREMIUM_REFRESH_STATES.includes(t.state),
  );

  if (eligibleTrades.length === 0) return;

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.warn('[TradeEngine] refreshActiveTradePremiums: POLYGON_API_KEY not set, skipping.');
    return;
  }

  // Build comma-separated ticker list for the batch snapshot call
  const tickers = eligibleTrades.map((t) => t.ticker!).join(',');

  // SPX options live under the O:SPX* namespace — underlying for Polygon is SPX (no I: prefix)
  const url =
    `https://api.polygon.io/v3/snapshot/options/SPX` +
    `?ticker.any_of=${encodeURIComponent(tickers)}&limit=250&apiKey=${apiKey}`;

  let snapshotMap: Map<string, number> = new Map();

  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      console.warn(
        `[TradeEngine] refreshActiveTradePremiums: Polygon snapshot HTTP ${response.status}`,
      );
      return;
    }

    const json = await response.json();
    const results: any[] = json?.results ?? [];

    for (const item of results) {
      const ticker: string | undefined = item?.details?.ticker ?? item?.ticker;
      if (!ticker) continue;

      const bid: number | null = item?.day?.open != null ? null : (item?.last_quote?.bid ?? null);
      const ask: number | null = item?.last_quote?.ask ?? null;
      const last: number | null = item?.last_trade?.price ?? item?.day?.close ?? null;

      // Prefer mid (bid+ask)/2 when both sides are present and positive
      let mid: number | null = null;
      if (bid != null && bid > 0 && ask != null && ask > 0) {
        mid = (bid + ask) / 2;
      } else if (last != null && last > 0) {
        mid = last;
      }

      if (mid != null) {
        snapshotMap.set(ticker, mid);
      }
    }
  } catch (err: any) {
    console.warn('[TradeEngine] refreshActiveTradePremiums: Polygon fetch error:', err.message);
    return;
  }

  // Lazy-load auto-trade dispatcher (avoid cycle with intelligence-engine)
  let dispatcher: typeof import('./auto-trade-dispatcher') | null = null;
  async function getDispatcher() {
    if (!dispatcher) dispatcher = await import('./auto-trade-dispatcher');
    return dispatcher;
  }

  // Apply premium refresh for each trade whose ticker resolved a price
  const refreshPromises = eligibleTrades.map(async (trade) => {
    const premium = snapshotMap.get(trade.ticker!);
    if (premium == null) return;

    try {
      await refreshTradePremium(trade.id, premium, currentSpxPrice);

      // Phase 5: auto-trade lifecycle alerts (TP / SL / closing)
      if ((trade as any).isAuto || (trade as any).is_auto) {
        await processAutoTradeLifecycle(trade, premium, currentSpxPrice, getDispatcher);
      }
    } catch (err: any) {
      console.warn(
        `[TradeEngine] refreshActiveTradePremiums: refreshTradePremium(${trade.id}) failed:`,
        err.message,
      );
    }
  });

  await Promise.allSettled(refreshPromises);
}
