/**
 * services/spx/auto-trade-dispatcher.ts
 *
 * Phase 5 — Sends Telegram notifications for SPX automated trades.
 *
 * All sends are TARGETED to a fixed list of chat_ids (settings.autoTradeChannelIds)
 * — never to getActiveAlertChannels(). This is the deliberate separation between
 * the analyst-broadcast pipeline and the automated pipeline.
 *
 * Flow:
 *   1. dispatchAutoTradeNew()    — sends the initial PNG card + caption
 *   2. dispatchAutoTradeTarget() — alerts when target N is hit
 *   3. dispatchAutoTradeStop()   — alerts when stop is hit
 *   4. dispatchAutoTradeClosed() — final P/L summary
 *
 * Each call writes a row to spx_alert_log with metadata.is_auto = true so
 * analytics can isolate auto-trade traffic.
 */

import { createClient } from '@supabase/supabase-js';
import { getBotToken, sendMessage, sendPhoto } from '@/lib/telegram/bot-sender';
import { logAlert } from './alert-controller';
import { generateAutoTradeImageBytes } from './auto-trade-image';
import type { SPXTrade } from './trade-engine';

function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function getServiceClient() {
  const { url, key } = getSupabaseCredentials();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fp(n: number | null | undefined, d = 2): string {
  if (n == null) return '—';
  return `$${n.toFixed(d)}`;
}

// ─── Caption builders ────────────────────────────────────────────────────────

function buildNewCaption(trade: SPXTrade): string {
  const dir = (trade.optionType ?? '?').toUpperCase();
  const mode = escapeHtml(trade.signalMode ?? '?');
  return [
    `⚡ <b>AUTO TRADE — ${dir}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code> | Strike <code>${trade.strike}</code> | ${trade.dte ?? '?'}DTE`,
    `Entry: <code>${fp(trade.entryPremium)}</code>  SPX: <code>${trade.entrySpxPrice ?? '—'}</code>`,
    `Stop: <code>${fp(trade.stopPremium)}</code>  T1/T2/T3: <code>${fp(trade.target1Premium)}</code> / <code>${fp(trade.target2Premium)}</code> / <code>${fp(trade.target3Premium)}</code>`,
    '',
    `<i>${mode} · Score ${Math.round(trade.compositeScore ?? 0)} · ${trade.confidenceClass ?? '?'}</i>`,
  ].join('\n');
}

function buildTargetCaption(trade: SPXTrade, n: 1 | 2 | 3, currentPremium: number): string {
  const entry = trade.entryPremium ?? currentPremium;
  const pnl = entry > 0 ? ((currentPremium - entry) / entry) * 100 : 0;
  return [
    `🎯 <b>AUTO · TARGET ${n} HIT</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code>`,
    `Entry <code>${fp(entry)}</code> → Now <code>${fp(currentPremium)}</code> (<code>${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%</code>)`,
    `High since entry: <code>${fp(trade.highestPremium)}</code>`,
  ].join('\n');
}

function buildStopCaption(trade: SPXTrade, currentPremium: number): string {
  const entry = trade.entryPremium ?? currentPremium;
  const pnl = entry > 0 ? ((currentPremium - entry) / entry) * 100 : 0;
  return [
    `🛑 <b>AUTO · STOP HIT</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code>`,
    `Entry <code>${fp(entry)}</code> → Exit <code>${fp(currentPremium)}</code> (<code>${pnl.toFixed(1)}%</code>)`,
    `MFE: <code>${(trade.mfe ?? 0).toFixed(1)}%</code>  MAE: <code>${(trade.mae ?? 0).toFixed(1)}%</code>`,
  ].join('\n');
}

function buildClosedCaption(trade: SPXTrade): string {
  const outcome = (trade.finalScoreOutcome ?? 'unknown').replace(/_/g, ' ').toUpperCase();
  return [
    `📋 <b>AUTO · TRADE CLOSED — ${escapeHtml(outcome)}</b>`,
    `<code>${escapeHtml(trade.ticker ?? '?')}</code>`,
    `Entry <code>${fp(trade.entryPremium)}</code> → Exit <code>${fp(trade.exitPremium)}</code>`,
    `Realized: <code>${(trade.realizedPnlPct ?? 0).toFixed(1)}%</code>`,
    `MFE: <code>${(trade.mfe ?? 0).toFixed(1)}%</code>  MAE: <code>${(trade.mae ?? 0).toFixed(1)}%</code>`,
    `Reason: ${escapeHtml(trade.exitReason ?? '—')}`,
  ].join('\n');
}

// ─── Targeted send helper ────────────────────────────────────────────────────

async function sendToChannels(params: {
  channelIds: string[];
  caption: string;
  photoBytes?: Uint8Array | null;
  alertType: string;
  dedupKey: string;
  tradeId: string;
}): Promise<number> {
  const { channelIds, caption, photoBytes, alertType, dedupKey, tradeId } = params;
  if (!channelIds || channelIds.length === 0) return 0;

  const { url, key } = getSupabaseCredentials();
  const token = await getBotToken(url, key);
  if (!token) {
    console.warn('[AutoDispatcher] no bot token available');
    await logAlert({ alertType, dedupKey, tradeId, channelCount: 0, suppressed: true, suppressReason: 'no_bot_token', messagePreview: caption.slice(0, 200), metadata: { is_auto: true } });
    return 0;
  }

  let sent = 0;
  for (const chatId of channelIds) {
    try {
      const msgId = photoBytes
        ? await sendPhoto(token, chatId, photoBytes, caption)
        : await sendMessage(token, chatId, caption);
      if (msgId) sent++;
    } catch (err: any) {
      console.error(`[AutoDispatcher] send to ${chatId} failed:`, err?.message);
    }
  }

  await logAlert({
    alertType, dedupKey, tradeId,
    channelCount: sent,
    suppressed: false,
    messagePreview: caption.slice(0, 200),
    metadata: { is_auto: true, channels: channelIds },
  });

  return sent;
}

// ─── Public dispatchers ──────────────────────────────────────────────────────

export async function dispatchAutoTradeNew(trade: SPXTrade): Promise<void> {
  if (!trade.id) return;
  const channelIds = (trade as any).autoChannelIds ?? (trade.metadata?.auto_channel_ids) ?? [];
  const channels = Array.isArray(channelIds) && channelIds.length > 0
    ? channelIds
    : await loadChannelIdsFromTrade(trade.id);
  if (channels.length === 0) return;

  const photoBytes = await generateAutoTradeImageBytes(trade);
  const caption = buildNewCaption(trade);

  const sent = await sendToChannels({
    channelIds: channels,
    caption,
    photoBytes,
    alertType: 'auto_new',
    dedupKey: `auto_new:${trade.id}`,
    tradeId: trade.id,
  });

  if (sent > 0) {
    try {
      await getServiceClient()
        .from('spx_trades')
        .update({ alert_sent_at: new Date().toISOString(), state: 'active' })
        .eq('id', trade.id);
    } catch (err: any) {
      console.warn('[AutoDispatcher] mark alert_sent_at failed:', err?.message);
    }
  }
}

export async function dispatchAutoTradeTarget(trade: SPXTrade, n: 1 | 2 | 3, currentPremium: number): Promise<void> {
  if (!trade.id) return;
  const channels = await loadChannelIdsFromTrade(trade.id);
  if (channels.length === 0) return;
  await sendToChannels({
    channelIds: channels,
    caption: buildTargetCaption(trade, n, currentPremium),
    alertType: 'auto_target',
    dedupKey: `auto_target:${trade.id}:t${n}`,
    tradeId: trade.id,
  });
  try {
    await getServiceClient()
      .from('spx_trades')
      .update({ last_target_alerted: n })
      .eq('id', trade.id);
  } catch {/* non-fatal */}
}

export async function dispatchAutoTradeStop(trade: SPXTrade, currentPremium: number): Promise<void> {
  if (!trade.id) return;
  const channels = await loadChannelIdsFromTrade(trade.id);
  if (channels.length === 0) return;
  await sendToChannels({
    channelIds: channels,
    caption: buildStopCaption(trade, currentPremium),
    alertType: 'auto_stop',
    dedupKey: `auto_stop:${trade.id}`,
    tradeId: trade.id,
  });
}

export async function dispatchAutoTradeClosed(trade: SPXTrade): Promise<void> {
  if (!trade.id) return;
  const channels = await loadChannelIdsFromTrade(trade.id);
  if (channels.length === 0) return;
  await sendToChannels({
    channelIds: channels,
    caption: buildClosedCaption(trade),
    alertType: 'auto_closed',
    dedupKey: `auto_closed:${trade.id}`,
    tradeId: trade.id,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadChannelIdsFromTrade(tradeId: string): Promise<string[]> {
  try {
    const { data } = await getServiceClient()
      .from('spx_trades')
      .select('auto_channel_ids')
      .eq('id', tradeId)
      .single();
    const arr = (data as any)?.auto_channel_ids;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
