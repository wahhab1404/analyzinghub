/**
 * services/spx/auto-trade-selector.ts
 *
 * Auto-Trade Selector — Phase 5
 *
 * Runs after each intelligence engine cycle when auto_trade_enabled = true.
 * Picks the best eligible contract and creates an auto trade, then sends
 * a Telegram image alert ONLY to the configured auto_trade_channel_ids.
 *
 * Eligibility:
 *   1. Signal is BUY_CALL or BUY_PUT (not WATCH)
 *   2. Confidence class >= autoTradeMinConfidenceClass
 *   3. Best matching contract: mid <= autoTradeMaxPremium AND liquidityScore >= autoTradeMinLiquidity
 *   4. No existing auto-trade for the same signal_event_id
 */

import { createClient } from '@supabase/supabase-js';
import type { SPXIntelligenceResult, ContractCandidate } from './types';
import type { SPXSettings } from './settings-engine';
import { computeEntryPlan } from './entry-engine';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const CONFIDENCE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

function meetsConfidence(actual: string | null | undefined, minimum: string): boolean {
  return (CONFIDENCE_RANK[actual ?? 'E'] ?? 0) >= (CONFIDENCE_RANK[minimum] ?? 0);
}

function pickBestEligibleContract(
  result: SPXIntelligenceResult,
  maxPremium: number,
  minLiquidity: number,
): ContractCandidate | null {
  const { contracts } = result;
  if (!contracts) return null;

  const candidates = [
    contracts.best,
    contracts.backup,
    contracts.conservative,
    contracts.aggressive,
  ].filter((c): c is ContractCandidate => c != null);

  for (const c of candidates) {
    if (c.mid <= maxPremium && c.liquidityScore >= minLiquidity) return c;
  }
  return null;
}

async function autoTradeExistsForSignal(signalEventId: string): Promise<boolean> {
  const supabase = getClient();
  const { count } = await supabase
    .from('spx_trades')
    .select('id', { count: 'exact', head: true })
    .eq('signal_event_id', signalEventId)
    .eq('is_auto', true);
  return (count ?? 0) > 0;
}

export interface AutoTradeResult {
  created: boolean;
  tradeId: string | null;
  reason: string;
  contractMid: number | null;
  channelsSent: number;
}

export async function runAutoTradeSelector(
  result: SPXIntelligenceResult,
  settings: SPXSettings,
): Promise<AutoTradeResult> {
  const { signal, features, walls, shock, contracts } = result;

  if (!settings.autoTradeEnabled)
    return { created: false, tradeId: null, reason: 'auto_trade_disabled', contractMid: null, channelsSent: 0 };

  if (!settings.autoTradeChannelIds || settings.autoTradeChannelIds.length === 0)
    return { created: false, tradeId: null, reason: 'no_channels_configured', contractMid: null, channelsSent: 0 };

  if (!signal)
    return { created: false, tradeId: null, reason: 'no_signal', contractMid: null, channelsSent: 0 };

  if (!['BUY_CALL', 'BUY_PUT'].includes(signal.signalType))
    return { created: false, tradeId: null, reason: `not_buy_signal:${signal.signalType}`, contractMid: null, channelsSent: 0 };

  if (!meetsConfidence(signal.confidenceClass, settings.autoTradeMinConfidenceClass))
    return { created: false, tradeId: null, reason: `confidence_too_low:${signal.confidenceClass}`, contractMid: null, channelsSent: 0 };

  const chosen = pickBestEligibleContract(result, settings.autoTradeMaxPremium, settings.autoTradeMinLiquidity);
  if (!chosen)
    return { created: false, tradeId: null, reason: `no_eligible_contract:maxPremium=${settings.autoTradeMaxPremium},minLiq=${settings.autoTradeMinLiquidity}`, contractMid: null, channelsSent: 0 };

  const alreadyExists = await autoTradeExistsForSignal(signal.id);
  if (alreadyExists)
    return { created: false, tradeId: null, reason: 'duplicate:auto_trade_exists', contractMid: chosen.mid, channelsSent: 0 };

  const entryPlan = computeEntryPlan(signal, features, chosen, walls, shock);
  const supabase = getClient();

  const { data: tradeRow, error: insertErr } = await supabase
    .from('spx_trades')
    .insert({
      signal_event_id:      signal.id,
      state:                'entered',
      is_auto:              true,
      auto_channel_ids:     settings.autoTradeChannelIds,
      ticker:               chosen.ticker,
      strike:               chosen.strike,
      expiry:               chosen.expiry,
      option_type:          chosen.optionType,
      dte:                  chosen.dte,
      // Lock the entry premium at signal time. Without this, downstream
      // consumers (realtime worker, lifecycle alerts) fall back to
      // current_premium — which drifts on every tick — making the "Entry"
      // shown in target/stop updates wrong.
      entry_premium:        chosen.mid,
      entry_spx_price:      features.underlying.price,
      entry_timestamp:      signal.generatedAt,
      current_premium:      chosen.mid,
      current_spx_price:    features.underlying.price,
      premium_updated_at:   signal.generatedAt,
      highest_premium:      chosen.mid,
      lowest_premium:       chosen.mid,
      highest_premium_at:   signal.generatedAt,
      lowest_premium_at:    signal.generatedAt,
      stop_premium:         entryPlan.stopPremium,
      hard_stop_spx:        entryPlan.hardStopSpx,
      soft_stop_conditions: entryPlan.softStopConditions,
      target_1_premium:     entryPlan.target1Premium,
      target_2_premium:     entryPlan.target2Premium,
      target_3_premium:     entryPlan.target3Premium,
      runner_premium:       entryPlan.runnerPremium,
      time_stop_at:         entryPlan.timeStopAt,
      suggested_entry_low:  entryPlan.suggestedEntryLow,
      suggested_entry_high: entryPlan.suggestedEntryHigh,
      composite_score:      signal.compositeScore,
      confidence_class:     signal.confidenceClass,
      signal_mode:          signal.signalMode,
      direction_bias:       signal.directionBias,
      last_target_alerted:  0,
      metadata: {
        signalType:              signal.signalType,
        signalRationale:         signal.rationale,
        keyFactors:              signal.keyFactors,
        risks:                   signal.risks,
        subScores:               signal.subScores,
        marketMode:              features.marketMode,
        sessionType:             features.sessionType,
        dataQuality:             features.dataQuality,
        autoMaxPremium:          settings.autoTradeMaxPremium,
        autoMinLiquidity:        settings.autoTradeMinLiquidity,
        autoMinConfidence:       settings.autoTradeMinConfidenceClass,
        contractRankLabel:       chosen.rankLabel,
        contractRankScore:       chosen.rankScore,
        contractLiquidityScore:  chosen.liquidityScore,
      },
    })
    .select('id')
    .single();

  if (insertErr || !tradeRow) {
    console.error('[AutoTradeSelector] DB insert failed:', insertErr?.message);
    return { created: false, tradeId: null, reason: `db_insert_failed`, contractMid: chosen.mid, channelsSent: 0 };
  }

  const tradeId = tradeRow.id as string;
  let channelsSent = 0;

  try {
    const { sendAutoTradeAlert } = await import('./spx-telegram');
    channelsSent = await sendAutoTradeAlert({
      tradeId, signal, features, contract: chosen, entryPlan,
      channelIds: settings.autoTradeChannelIds,
    });
    if (channelsSent > 0) {
      await supabase
        .from('spx_trades')
        .update({ alert_sent_at: new Date().toISOString() })
        .eq('id', tradeId);
    }
  } catch (alertErr: any) {
    console.warn('[AutoTradeSelector] Alert failed (trade still created):', alertErr.message);
  }

  console.log(`[AutoTradeSelector] ✅ ${tradeId} | ${chosen.ticker} @ $${chosen.mid} | ${channelsSent} channels`);
  return { created: true, tradeId, reason: 'ok', contractMid: chosen.mid, channelsSent };
}

// ── LIFECYCLE: CHECK TP / SL ─────────────────────────────────────────────────

export async function checkAutoTradeLifecycle(
  tradeId: string,
  currentPremium: number,
  currentSpxPrice: number,
): Promise<void> {
  const supabase = getClient();

  const { data: row } = await supabase
    .from('spx_trades')
    .select(
      'id, is_auto, state, auto_channel_ids, stop_premium, hard_stop_spx, ' +
      'target_1_premium, target_2_premium, target_3_premium, last_target_alerted, ' +
      'ticker, strike, option_type, dte, entry_premium, direction_bias, signal_mode, confidence_class, composite_score',
    )
    .eq('id', tradeId)
    .single();

  if (!row || !row.is_auto) return;
  if (!['alerted', 'entered', 'active'].includes(row.state)) return;

  const channelIds: string[] = Array.isArray(row.auto_channel_ids) ? row.auto_channel_ids : [];
  if (channelIds.length === 0) return;

  const stopP   = row.stop_premium != null ? Number(row.stop_premium) : null;
  const t1      = row.target_1_premium != null ? Number(row.target_1_premium) : null;
  const t2      = row.target_2_premium != null ? Number(row.target_2_premium) : null;
  const t3      = row.target_3_premium != null ? Number(row.target_3_premium) : null;
  const lastAlerted = Number(row.last_target_alerted ?? 0);

  try {
    const { sendAutoTradeLifecycleAlert } = await import('./spx-telegram');

    if (stopP != null && currentPremium <= stopP) {
      await sendAutoTradeLifecycleAlert({ type: 'stop_hit', tradeId, row, currentPremium, currentSpxPrice, channelIds });
      const { closeTrade } = await import('./trade-engine');
      await closeTrade(tradeId, currentPremium, currentSpxPrice, 'auto_stop_hit');
      return;
    }

    const targets: [number | null, 1 | 2 | 3][] = [[t1, 1], [t2, 2], [t3, 3]];
    for (const [tPremium, tNum] of targets) {
      if (tPremium != null && currentPremium >= tPremium && lastAlerted < tNum) {
        await sendAutoTradeLifecycleAlert({ type: 'target_hit', targetNum: tNum, tradeId, row, currentPremium, currentSpxPrice, channelIds });
        await supabase.from('spx_trades').update({ last_target_alerted: tNum, state: 'active' }).eq('id', tradeId);
        if (tNum === 3) {
          const { closeTrade } = await import('./trade-engine');
          await closeTrade(tradeId, currentPremium, currentSpxPrice, 'auto_target_3_hit');
        }
        break;
      }
    }
  } catch (err: any) {
    console.warn('[AutoTradeSelector] lifecycle alert failed:', err.message);
  }
}
