/**
 * services/spx/alert-controller.ts
 *
 * Phase 3 — Alert Control: deduplication, cooldown, per-channel routing,
 * test mode, silent mode, and throttling for SPX intelligence alerts.
 */

import { createClient } from '@supabase/supabase-js';

// ── CLIENT ────────────────────────────────────────────────────────────────────

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars for alert-controller');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface AlertChannel {
  /** Telegram chat_id (string) */
  chatId: string;
  /** Profile ID of the channel owner */
  userId: string;
  /** 'public' | 'subscribers' | 'followers' */
  audienceType: string;
}

export interface AlertControlConfig {
  alertType: string;
  /** Unique key for this specific alert event — e.g. 'new_signal:{signalId}' */
  dedupKey: string;
  /** Minimum milliseconds between the same dedupKey being sent again */
  cooldownMs: number;
  /** If true: log only, do not send */
  testMode?: boolean;
  /** If true: suppress sending entirely */
  silentMode?: boolean;
}

// ── DEFAULT COOLDOWNS ─────────────────────────────────────────────────────────

/**
 * Default cooldown values per alert type (milliseconds).
 * 0 = no cooldown (always send once per unique event).
 */
export const ALERT_COOLDOWNS: Record<string, number> = {
  new_signal:        5 * 60 * 1000,   // 5 min — same signal won't re-alert
  shock_warning:     3 * 60 * 1000,   // 3 min
  wall_break:        5 * 60 * 1000,   // 5 min per broken strike
  wall_rejection:    5 * 60 * 1000,   // 5 min per rejected strike
  entry_confirmed:   0,               // always send — one-time per trade
  target_hit:        0,               // always send — one-time per target
  stop_hit:          0,               // always send — one-time per trade
  trade_closed:      0,               // always send — one-time per trade
  exit_alert:        2 * 60 * 1000,   // 2 min per (trade × type) bucket
};

// ── SHOULD SEND ───────────────────────────────────────────────────────────────

/**
 * Returns whether this alert should be sent.
 * Checks global silent/test modes and per-key cooldown from spx_alert_log.
 */
export async function shouldSendAlert(config: AlertControlConfig): Promise<{
  allowed: boolean;
  reason: string;
}> {
  // Global env override
  if (process.env.SPX_ALERTS_SILENT === 'true') {
    return { allowed: false, reason: 'silent_mode' };
  }
  if (config.silentMode) {
    return { allowed: false, reason: 'silent_mode' };
  }
  if (config.testMode || process.env.SPX_ALERTS_TEST === 'true') {
    return { allowed: false, reason: 'test_mode' };
  }

  // Zero cooldown = always allowed
  if (config.cooldownMs === 0) {
    return { allowed: true, reason: 'ok' };
  }

  try {
    const supabase = getClient();
    const cutoff = new Date(Date.now() - config.cooldownMs).toISOString();

    const { data } = await supabase
      .from('spx_alert_log')
      .select('created_at')
      .eq('dedup_key', config.dedupKey)
      .eq('suppressed', false)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      const lastSentAt = new Date(data[0].created_at).getTime();
      const secondsAgo = Math.floor((Date.now() - lastSentAt) / 1000);
      return { allowed: false, reason: `cooldown:${secondsAgo}s_ago` };
    }
  } catch (err: any) {
    // If we can't check, allow (fail open for alerting)
    console.warn('[AlertController] cooldown check failed, allowing:', err.message);
  }

  return { allowed: true, reason: 'ok' };
}

// ── LOG ALERT ─────────────────────────────────────────────────────────────────

/** Persist an alert attempt to spx_alert_log (always called, suppressed or not). */
export async function logAlert(params: {
  alertType: string;
  dedupKey: string;
  signalEventId?: string | null;
  tradeId?: string | null;
  channelCount: number;
  suppressed: boolean;
  suppressReason?: string;
  messagePreview?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const supabase = getClient();
    const { error } = await supabase.from('spx_alert_log').insert({
      alert_type:       params.alertType,
      dedup_key:        params.dedupKey,
      signal_event_id:  params.signalEventId ?? null,
      trade_id:         params.tradeId ?? null,
      channel_count:    params.channelCount,
      suppressed:       params.suppressed,
      suppress_reason:  params.suppressReason ?? null,
      message_preview:  params.messagePreview ? params.messagePreview.slice(0, 200) : null,
      metadata:         params.metadata ?? null,
    });
    if (error) {
      console.error('[AlertController] Failed to log alert:', error.message);
    }
  } catch (err: any) {
    console.error('[AlertController] logAlert threw:', err.message);
  }
}

// ── GET ACTIVE CHANNELS ───────────────────────────────────────────────────────

/**
 * Returns all enabled Telegram channels for Analyzer and SuperAdmin users
 * who have telegram_enabled set in notification_preferences.
 * Deduplicates by chatId.
 */
export async function getActiveAlertChannels(): Promise<AlertChannel[]> {
  try {
    const supabase = getClient();

    // 1. Get all Analyzer/SuperAdmin profile IDs
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, roles!inner(name)')
      .in('roles.name' as any, ['Analyzer', 'SuperAdmin']);

    if (!profiles || profiles.length === 0) return [];

    const profileIds = profiles.map((p: any) => p.id);

    // 2. Filter to those with telegram_enabled
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .in('user_id', profileIds)
      .eq('telegram_enabled', true);

    const enabledIds = prefs ? prefs.map((p: any) => p.user_id) : profileIds;

    // 3. Get their enabled telegram channels
    const { data: channels } = await supabase
      .from('telegram_channels')
      .select('channel_id, user_id, audience_type')
      .in('user_id', enabledIds)
      .eq('enabled', true);

    if (!channels || channels.length === 0) return [];

    // Deduplicate by chatId
    const seen = new Set<string>();
    const result: AlertChannel[] = [];
    for (const ch of channels) {
      if (ch.channel_id && !seen.has(ch.channel_id)) {
        seen.add(ch.channel_id);
        result.push({
          chatId:      ch.channel_id,
          userId:      ch.user_id,
          audienceType: ch.audience_type ?? 'public',
        });
      }
    }

    return result;
  } catch (err: any) {
    console.error('[AlertController] getActiveAlertChannels failed:', err.message);
    return [];
  }
}
