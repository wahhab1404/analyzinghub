/**
 * services/spx/spx-telegram.ts
 *
 * Phase 3 — SPX-specific Telegram alert formatter and sender.
 *
 * Integrates with:
 *   - lib/telegram/bot-sender (getBotToken, sendMessage)
 *   - alert-controller (shouldSendAlert, logAlert, getActiveAlertChannels, ALERT_COOLDOWNS)
 *
 * All templates use HTML parse mode.
 * All functions are non-throwing — errors are logged and swallowed.
 */

import { getBotToken, sendMessage } from '@/lib/telegram/bot-sender';
import {
  shouldSendAlert,
  logAlert,
  getActiveAlertChannels,
  ALERT_COOLDOWNS,
} from './alert-controller';
import type { SignalOutput, SPXFeatures, WallEngineOutput, ShockEngineOutput, ContractRankingOutput } from './types';
import type { SPXTrade } from './trade-engine';
import type { EntryPlan } from './entry-engine';
import type { ExitSignal } from './exit-engine';

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fp(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  return `$${n.toFixed(decimals)}`;
}

function fn(n: number | null | undefined, decimals = 1, sign = false): string {
  if (n == null) return '—';
  const s = n.toFixed(decimals);
  return sign && n > 0 ? `+${s}` : s;
}

function fScore(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n).toString();
}

function formatDateET(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

function durationMinutes(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—';
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── BROADCAST HELPER ──────────────────────────────────────────────────────────

async function broadcastToChannels(
  text: string,
  alertType: string,
  dedupKey: string,
  meta?: {
    signalEventId?: string | null;
    tradeId?: string | null;
    [key: string]: any;
  },
): Promise<void> {
  const check = await shouldSendAlert({
    alertType,
    dedupKey,
    cooldownMs: ALERT_COOLDOWNS[alertType] ?? 60_000,
  });

  if (!check.allowed) {
    await logAlert({
      alertType,
      dedupKey,
      signalEventId: meta?.signalEventId,
      tradeId:       meta?.tradeId,
      channelCount:  0,
      suppressed:    true,
      suppressReason: check.reason,
      messagePreview: text.slice(0, 200),
      metadata:      meta,
    });
    return;
  }

  const { url, key } = getSupabaseCredentials();
  const token = await getBotToken(url, key);
  if (!token) {
    console.warn('[SPXTelegram] No bot token available — skipping broadcast');
    await logAlert({ alertType, dedupKey, channelCount: 0, suppressed: true, suppressReason: 'no_bot_token', messagePreview: text.slice(0, 200), metadata: meta });
    return;
  }

  const channels = await getActiveAlertChannels();
  if (channels.length === 0) {
    console.info('[SPXTelegram] No active channels to broadcast to');
    await logAlert({ alertType, dedupKey, channelCount: 0, suppressed: false, messagePreview: text.slice(0, 200), metadata: meta });
    return;
  }

  let successCount = 0;
  for (const ch of channels) {
    try {
      const msgId = await sendMessage(token, ch.chatId, text);
      if (msgId) successCount++;
    } catch (err: any) {
      console.error(`[SPXTelegram] Failed to send to ${ch.chatId}:`, err.message);
    }
  }

  await logAlert({
    alertType,
    dedupKey,
    signalEventId: meta?.signalEventId,
    tradeId:       meta?.tradeId,
    channelCount:  successCount,
    suppressed:    false,
    messagePreview: text.slice(0, 200),
    metadata:      meta,
  });
}

// ── TEMPLATES ─────────────────────────────────────────────────────────────────

function formatNewSignalAlert(
  signal: SignalOutput,
  features: SPXFeatures,
  walls: WallEngineOutput,
  contracts: ContractRankingOutput | null,
  entryPlan: EntryPlan | null,
): string {
  const best = contracts?.best;
  const nearest = walls.nearestWall;
  const u = features.underlying;

  const wallLine = nearest
    ? `\nNearest Wall: <code>${nearest.strike}</code> ${nearest.side.toUpperCase()} (<code>${Math.round(nearest.distanceFromPrice)}pts</code> away, strength <code>${Math.round(nearest.strength)}</code>)`
    : '';

  const contractLine = best
    ? `\nContract: <code>${escapeHtml(best.ticker)}</code> | Strike <code>${best.strike}</code> | ${best.dte ?? '?'}DTE`
    : '';

  const entryLines = entryPlan && best
    ? `\nEntry zone: <code>${fp(entryPlan.suggestedEntryLow)}–${fp(entryPlan.suggestedEntryHigh)}</code>` +
      `\nStop (premium): <code>${fp(entryPlan.stopPremium)}</code> | SPX stop: <code>${entryPlan.hardStopSpx}</code>` +
      `\nT1: <code>${fp(entryPlan.target1Premium)}</code> | T2: <code>${fp(entryPlan.target2Premium)}</code> | T3: <code>${fp(entryPlan.target3Premium)}</code>`
    : '';

  return [
    `📊 <b>SPX SIGNAL — ${escapeHtml(signal.signalType)}</b>`,
    `Mode: <b>${escapeHtml(signal.signalMode)}</b> | <b>${escapeHtml(signal.directionBias.toUpperCase())}</b>`,
    `Score: <code>${fScore(signal.compositeScore)}/100</code> | Confidence: <b>${signal.confidenceClass}</b>`,
    '',
    `SPX: <code>${u.price}</code> | ${escapeHtml(features.sessionType)}`,
    `Trend: ${u.trend1m}/${u.trend5m}/${u.trend15m}`,
    wallLine,
    contractLine,
    entryLines,
    '',
    escapeHtml(signal.rationale),
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatShockWarning(shock: ShockEngineOutput, features: SPXFeatures): string {
  const vel = shock.priceVelocity1m;
  const velStr = vel != null ? `<code>${vel >= 0 ? '+' : ''}${vel.toFixed(1)}pts/min</code>` : '—';
  const contPct = Math.round(shock.continuationProbability * 100);
  const revPct  = Math.round(shock.reversalProbability * 100);
  const pressure = shock.directionalPressure > 0 ? '▲ Upward' : shock.directionalPressure < 0 ? '▼ Downward' : '↔ Neutral';
  const patterns = shock.patterns?.length ? escapeHtml(shock.patterns.join(', ')) : 'none detected';

  return [
    `⚡ <b>SHOCK WARNING — ${shock.severity.toUpperCase()}</b>`,
    `SPX: <code>${features.underlying.price}</code> | Composite shock: <code>${fScore(shock.compositeShockScore)}/100</code>`,
    '',
    `Velocity (1m): ${velStr}`,
    `Continuation: <code>${contPct}%</code> | Reversal: <code>${revPct}%</code>`,
    `Pressure: ${pressure}`,
    '',
    `Patterns: ${patterns}`,
  ].join('\n');
}

function formatWallBreakAlert(
  wall: { strike: number; side: 'call' | 'put'; strength: number; distanceFromPrice: number },
  spxPrice: number,
): string {
  const impl = wall.side === 'call'
    ? 'Price has broken above resistance — potential breakout'
    : 'Price has broken below support — potential breakdown';

  return [
    `🔴 <b>WALL BREAK — ${wall.side.toUpperCase()} WALL</b>`,
    `Broken Strike: <code>${wall.strike}</code>`,
    `SPX: <code>${spxPrice}</code> (was <code>${Math.round(wall.distanceFromPrice)}pts</code> away)`,
    `Wall strength was: <code>${Math.round(wall.strength)}/100</code>`,
    '',
    `Implication: ${escapeHtml(impl)}`,
  ].join('\n');
}

function formatWallRejectionAlert(
  wall: { strike: number; side: 'call' | 'put'; strength: number; distanceFromPrice: number },
  spxPrice: number,
): string {
  const impl = wall.side === 'call'
    ? 'Resistance is holding — consider PUT setup'
    : 'Support is holding — consider CALL setup';

  return [
    `🟢 <b>WALL REJECTION — ${wall.side.toUpperCase()} WALL HELD</b>`,
    `Strike: <code>${wall.strike}</code> | Strength: <code>${Math.round(wall.strength)}/100</code>`,
    `SPX: <code>${spxPrice}</code> | Distance: <code>${Math.round(wall.distanceFromPrice)}pts</code>`,
    '',
    `Implication: ${escapeHtml(impl)}`,
  ].join('\n');
}

function formatEntryConfirmed(trade: SPXTrade, features: SPXFeatures): string {
  return [
    `✅ <b>ENTRY CONFIRMED — ${(trade.optionType ?? '?').toUpperCase()}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code> | Strike <code>${trade.strike}</code> | ${trade.dte ?? '?'}DTE`,
    `Entry Premium: <code>${fp(trade.entryPremium)}</code>`,
    `SPX at Entry: <code>${trade.entrySpxPrice ?? '—'}</code>`,
    '',
    `Stop (premium): <code>${fp(trade.stopPremium)}</code> | Hard Stop SPX: <code>${trade.hardStopSpx ?? '—'}</code>`,
    `T1: <code>${fp(trade.target1Premium)}</code> | T2: <code>${fp(trade.target2Premium)}</code> | T3: <code>${fp(trade.target3Premium)}</code>`,
    `Time Stop: ${formatDateET(trade.timeStopAt)} ET`,
    '',
    `Signal: ${escapeHtml(trade.signalMode ?? '?')} | Score: <code>${fScore(trade.compositeScore)}</code>`,
  ].join('\n');
}

function formatTargetHit(
  trade: SPXTrade,
  targetNumber: 1 | 2 | 3,
  currentPremium: number,
  spxPrice: number,
): string {
  const entryP  = trade.entryPremium ?? currentPremium;
  const pnlPct  = entryP > 0 ? ((currentPremium - entryP) / entryP * 100) : 0;
  const trailMsg = targetNumber === 3
    ? '🚀 Full target reached — consider runner or full exit'
    : `💡 Consider trailing stop to ${targetNumber === 1 ? 'breakeven' : `T${targetNumber - 1}`}`;

  return [
    `🎯 <b>TARGET HIT — T${targetNumber}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code> | Premium: <code>${fp(currentPremium)}</code>`,
    `Entry: <code>${fp(trade.entryPremium)}</code> → Current: <code>${fp(currentPremium)}</code> (<code>${fn(pnlPct, 1, true)}%</code>)`,
    `SPX: <code>${spxPrice}</code>`,
    `High since entry: <code>${fp(trade.highestPremium)}</code>`,
    '',
    trailMsg,
  ].join('\n');
}

function formatStopHit(
  trade: SPXTrade,
  currentPremium: number,
  spxPrice: number,
): string {
  const entryP = trade.entryPremium ?? currentPremium;
  const pnlPct = entryP > 0 ? ((currentPremium - entryP) / entryP * 100) : 0;

  return [
    `🛑 <b>STOP HIT</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code>`,
    `Entry: <code>${fp(trade.entryPremium)}</code> → Exit: <code>${fp(currentPremium)}</code> (<code>${fn(pnlPct, 1, true)}%</code>)`,
    `SPX: <code>${spxPrice}</code>`,
    '',
    `MFE: <code>${fn(trade.mfe, 1, true)}%</code> | MAE: <code>${fn(trade.mae, 1)}%</code>`,
    `Exit reason: ${escapeHtml(trade.exitReason ?? 'stop_hit')}`,
  ].join('\n');
}

function formatTradeClosedSummary(trade: SPXTrade): string {
  const outcome = (trade.finalScoreOutcome ?? 'unknown').replace(/_/g, ' ').toUpperCase();
  const dur = durationMinutes(trade.entryTimestamp, trade.exitTimestamp);

  return [
    `📋 <b>TRADE CLOSED — ${escapeHtml(outcome)}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code> | ${escapeHtml(trade.signalMode ?? '?')} | ${escapeHtml(trade.directionBias ?? '?')}`,
    `Entry: <code>${fp(trade.entryPremium)}</code> → Exit: <code>${fp(trade.exitPremium)}</code>`,
    `P/L: <code>${fn(trade.realizedPnlPct, 1, true)}%</code>`,
    '',
    `📈 High: <code>${fp(trade.highestPremium)}</code> | 📉 Low: <code>${fp(trade.lowestPremium)}</code>`,
    `MFE: <code>${fn(trade.mfe, 1, true)}%</code> | MAE: <code>${fn(trade.mae, 1)}%</code>`,
    `Duration: ${dur}`,
    `Exit: ${escapeHtml(trade.exitReason ?? '?')}`,
    '',
    `Signal Score: <code>${fScore(trade.compositeScore)}</code> | Confidence: <b>${trade.confidenceClass ?? '—'}</b>`,
  ].join('\n');
}

function formatExitAlert(
  exitSignal: ExitSignal,
  trade: SPXTrade,
  currentPremium: number | null,
): string {
  const entryP   = trade.entryPremium;
  const currP    = currentPremium ?? trade.currentPremium;
  const pnlPct   = entryP && currP ? ((currP - entryP) / entryP * 100) : null;
  const exitType = exitSignal.type.replace(/_/g, ' ');

  return [
    `⚠️ <b>EXIT SIGNAL — ${escapeHtml(exitType)}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code> | ${escapeHtml(exitSignal.urgency.toUpperCase())}`,
    `SPX: <code>${exitSignal.spxPriceAtSignal}</code> | Premium: <code>${fp(currP)}</code>`,
    `Current P/L: <code>${fn(pnlPct, 1, true)}%</code>`,
    '',
    `Reason: ${escapeHtml(exitSignal.reason)}`,
    `Triggered by: ${escapeHtml(exitSignal.triggeredBy.join(', '))}`,
  ].join('\n');
}

// ── EXPORTED SEND FUNCTIONS ───────────────────────────────────────────────────

/** Send a new signal alert to all active Telegram channels. */
export async function sendNewSignalAlert(
  signal: SignalOutput,
  features: SPXFeatures,
  walls: WallEngineOutput,
  contracts: ContractRankingOutput | null,
  entryPlan: EntryPlan | null,
): Promise<void> {
  try {
    const text = formatNewSignalAlert(signal, features, walls, contracts, entryPlan);
    await broadcastToChannels(text, 'new_signal', `new_signal:${signal.id}`, { signalEventId: signal.id });
  } catch (err: any) {
    console.error('[SPXTelegram] sendNewSignalAlert failed:', err.message);
  }
}

/** Send a shock warning if severity is moderate or worse. */
export async function sendShockWarning(
  shock: ShockEngineOutput,
  features: SPXFeatures,
): Promise<void> {
  try {
    if (!['moderate', 'severe', 'extreme'].includes(shock.severity)) return;
    const text = formatShockWarning(shock, features);
    // Deduplicate by 3-min time bucket so it can re-alert if severity worsens
    const bucket = Math.floor(Date.now() / 180_000);
    await broadcastToChannels(text, 'shock_warning', `shock_warning:${shock.severity}:${bucket}`);
  } catch (err: any) {
    console.error('[SPXTelegram] sendShockWarning failed:', err.message);
  }
}

/** Send a wall break alert for any broken walls. */
export async function sendWallBreakAlert(
  walls: WallEngineOutput,
  features: SPXFeatures,
): Promise<void> {
  try {
    const candidates = [walls.callWall, walls.putWall].filter(w => w?.state === 'broken');
    for (const wall of candidates) {
      if (!wall) continue;
      const text = formatWallBreakAlert(wall, features.underlying.price);
      const bucket = Math.floor(Date.now() / 300_000);
      await broadcastToChannels(text, 'wall_break', `wall_break:${wall.strike}:${bucket}`);
    }
  } catch (err: any) {
    console.error('[SPXTelegram] sendWallBreakAlert failed:', err.message);
  }
}

/** Send a wall rejection alert for any rejected walls. */
export async function sendWallRejectionAlert(
  walls: WallEngineOutput,
  features: SPXFeatures,
): Promise<void> {
  try {
    const candidates = [walls.callWall, walls.putWall].filter(w => w?.state === 'rejected');
    for (const wall of candidates) {
      if (!wall) continue;
      const text = formatWallRejectionAlert(wall, features.underlying.price);
      const bucket = Math.floor(Date.now() / 300_000);
      await broadcastToChannels(text, 'wall_rejection', `wall_rejection:${wall.strike}:${bucket}`);
    }
  } catch (err: any) {
    console.error('[SPXTelegram] sendWallRejectionAlert failed:', err.message);
  }
}

/** Send entry confirmed alert for a trade that was just entered. */
export async function sendEntryConfirmed(
  trade: SPXTrade,
  features: SPXFeatures,
): Promise<void> {
  try {
    const text = formatEntryConfirmed(trade, features);
    await broadcastToChannels(text, 'entry_confirmed', `entry_confirmed:${trade.id}`, { tradeId: trade.id });
  } catch (err: any) {
    console.error('[SPXTelegram] sendEntryConfirmed failed:', err.message);
  }
}

/** Send a target hit alert. */
export async function sendTargetHit(
  trade: SPXTrade,
  targetNumber: 1 | 2 | 3,
  currentPremium: number,
  spxPrice: number,
): Promise<void> {
  try {
    const text = formatTargetHit(trade, targetNumber, currentPremium, spxPrice);
    await broadcastToChannels(text, 'target_hit', `target_hit:${trade.id}:t${targetNumber}`, { tradeId: trade.id });
  } catch (err: any) {
    console.error('[SPXTelegram] sendTargetHit failed:', err.message);
  }
}

/** Send a stop hit alert. */
export async function sendStopHit(
  trade: SPXTrade,
  currentPremium: number,
  spxPrice: number,
): Promise<void> {
  try {
    const text = formatStopHit(trade, currentPremium, spxPrice);
    await broadcastToChannels(text, 'stop_hit', `stop_hit:${trade.id}`, { tradeId: trade.id });
  } catch (err: any) {
    console.error('[SPXTelegram] sendStopHit failed:', err.message);
  }
}

/** Send a trade closed summary with full P/L, MFE/MAE, and outcome. */
export async function sendTradeClosedSummary(trade: SPXTrade): Promise<void> {
  try {
    const text = formatTradeClosedSummary(trade);
    await broadcastToChannels(text, 'trade_closed', `trade_closed:${trade.id}`, { tradeId: trade.id });
  } catch (err: any) {
    console.error('[SPXTelegram] sendTradeClosedSummary failed:', err.message);
  }
}

/** Send an exit signal advisory alert. */
export async function sendExitAlert(
  exitSignal: ExitSignal,
  trade: SPXTrade,
  currentPremium: number | null,
): Promise<void> {
  try {
    const text = formatExitAlert(exitSignal, trade, currentPremium);
    const bucket = Math.floor(Date.now() / 120_000);
    await broadcastToChannels(
      text,
      'exit_alert',
      `exit_alert:${trade.id}:${exitSignal.type}:${bucket}`,
      { tradeId: trade.id },
    );
  } catch (err: any) {
    console.error('[SPXTelegram] sendExitAlert failed:', err.message);
  }
}
