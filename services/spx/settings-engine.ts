/**
 * services/spx/settings-engine.ts
 *
 * Phase 4 — SPX Options Intelligence Platform
 * Reads/writes the spx_settings singleton row and logs engine runs.
 */

import { createClient } from '@supabase/supabase-js';

// ── SERVICE ROLE CLIENT ───────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface SPXSettings {
  // Engine
  engineEnabled: boolean;
  paperMode: boolean;
  // Score thresholds
  minScoreToAlert: number;
  minScoreToTrade: number;
  // Contract filters
  minDelta: number;
  maxDelta: number;
  maxSpreadPct: number;
  minOI: number;
  minVolume: number;
  // Expiry
  prefer0DTE: boolean;
  prefer1DTE: boolean;
  preferWeekly: boolean;
  maxDTE: number;
  // Wall sensitivity
  wallStrengthThreshold: number;
  wallDistanceThreshold: number;
  // Shock
  minShockSeverity: 'mild' | 'moderate' | 'severe' | 'extreme';
  minShockScore: number;
  // Flow
  flowAnomalySensitivity: number;
  // Telegram
  telegramEnabled: boolean;
  telegramSendSignals: boolean;
  telegramSendShock: boolean;
  telegramSendWall: boolean;
  telegramSendTrade: boolean;
  // Dedup windows (seconds)
  dedupNewSignalS: number;
  dedupShockWarningS: number;
  dedupWallAlertS: number;
  dedupExitAlertS: number;
  // Active hours (ET)
  activeHourStart: number;
  activeHourEnd: number;
  // Data
  premiumSource: 'polygon' | 'cboe' | 'manual';
  staleDataThresholdS: number;
  // Replay
  replaySpeed: number;
  replayDefaultDaysBack: number;
  // Auto-Trade (Phase 5)
  autoTradeEnabled: boolean;
  autoTradeMaxPremium: number;
  autoTradeMinLiquidity: number;
  autoTradeMinConfidenceClass: 'A' | 'B' | 'C' | 'D' | 'E';
  autoTradeChannelIds: string[];
  autoTradeTrackLifecycle: boolean;
  // Meta
  updatedAt: string;
  updatedBy: string | null;
}

// ── DEFAULTS ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: SPXSettings = {
  // Engine
  engineEnabled: false,
  paperMode: true,
  // Score thresholds
  minScoreToAlert: 45,
  minScoreToTrade: 60,
  // Contract filters
  minDelta: 0.15,
  maxDelta: 0.55,
  maxSpreadPct: 30,
  minOI: 100,
  minVolume: 10,
  // Expiry
  prefer0DTE: true,
  prefer1DTE: false,
  preferWeekly: false,
  maxDTE: 7,
  // Wall sensitivity
  wallStrengthThreshold: 40,
  wallDistanceThreshold: 0.5,
  // Shock
  minShockSeverity: 'moderate',
  minShockScore: 50,
  // Flow
  flowAnomalySensitivity: 2.0,
  // Telegram
  telegramEnabled: false,
  telegramSendSignals: true,
  telegramSendShock: true,
  telegramSendWall: true,
  telegramSendTrade: true,
  // Dedup windows (seconds)
  dedupNewSignalS: 300,
  dedupShockWarningS: 180,
  dedupWallAlertS: 600,
  dedupExitAlertS: 60,
  // Active hours (ET)
  activeHourStart: 9,
  activeHourEnd: 16,
  // Data
  premiumSource: 'polygon',
  staleDataThresholdS: 120,
  // Replay
  replaySpeed: 1.0,
  replayDefaultDaysBack: 5,
  // Auto-Trade
  autoTradeEnabled: false,
  autoTradeMaxPremium: 4.00,
  autoTradeMinLiquidity: 60,
  autoTradeMinConfidenceClass: 'B',
  autoTradeChannelIds: [],
  autoTradeTrackLifecycle: true,
  // Meta
  updatedAt: new Date().toISOString(),
  updatedBy: null,
};

// ── MAPPING HELPERS ───────────────────────────────────────────────────────────

export function dbRowToSettings(row: any): SPXSettings {
  return {
    engineEnabled:          row.engine_enabled          ?? DEFAULT_SETTINGS.engineEnabled,
    paperMode:              row.paper_mode              ?? DEFAULT_SETTINGS.paperMode,
    minScoreToAlert:        row.min_score_to_alert      ?? DEFAULT_SETTINGS.minScoreToAlert,
    minScoreToTrade:        row.min_score_to_trade      ?? DEFAULT_SETTINGS.minScoreToTrade,
    minDelta:               row.min_delta               ?? DEFAULT_SETTINGS.minDelta,
    maxDelta:               row.max_delta               ?? DEFAULT_SETTINGS.maxDelta,
    maxSpreadPct:           row.max_spread_pct          ?? DEFAULT_SETTINGS.maxSpreadPct,
    minOI:                  row.min_oi                  ?? DEFAULT_SETTINGS.minOI,
    minVolume:              row.min_volume              ?? DEFAULT_SETTINGS.minVolume,
    prefer0DTE:             row.prefer_0dte             ?? DEFAULT_SETTINGS.prefer0DTE,
    prefer1DTE:             row.prefer_1dte             ?? DEFAULT_SETTINGS.prefer1DTE,
    preferWeekly:           row.prefer_weekly           ?? DEFAULT_SETTINGS.preferWeekly,
    maxDTE:                 row.max_dte                 ?? DEFAULT_SETTINGS.maxDTE,
    wallStrengthThreshold:  row.wall_strength_threshold ?? DEFAULT_SETTINGS.wallStrengthThreshold,
    wallDistanceThreshold:  row.wall_distance_threshold ?? DEFAULT_SETTINGS.wallDistanceThreshold,
    minShockSeverity:       row.min_shock_severity      ?? DEFAULT_SETTINGS.minShockSeverity,
    minShockScore:          row.min_shock_score         ?? DEFAULT_SETTINGS.minShockScore,
    flowAnomalySensitivity: row.flow_anomaly_sensitivity ?? DEFAULT_SETTINGS.flowAnomalySensitivity,
    telegramEnabled:        row.telegram_enabled        ?? DEFAULT_SETTINGS.telegramEnabled,
    telegramSendSignals:    row.telegram_send_signals   ?? DEFAULT_SETTINGS.telegramSendSignals,
    telegramSendShock:      row.telegram_send_shock     ?? DEFAULT_SETTINGS.telegramSendShock,
    telegramSendWall:       row.telegram_send_wall      ?? DEFAULT_SETTINGS.telegramSendWall,
    telegramSendTrade:      row.telegram_send_trade     ?? DEFAULT_SETTINGS.telegramSendTrade,
    dedupNewSignalS:        row.dedup_new_signal_s      ?? DEFAULT_SETTINGS.dedupNewSignalS,
    dedupShockWarningS:     row.dedup_shock_warning_s   ?? DEFAULT_SETTINGS.dedupShockWarningS,
    dedupWallAlertS:        row.dedup_wall_alert_s      ?? DEFAULT_SETTINGS.dedupWallAlertS,
    dedupExitAlertS:        row.dedup_exit_alert_s      ?? DEFAULT_SETTINGS.dedupExitAlertS,
    activeHourStart:        row.active_hour_start       ?? DEFAULT_SETTINGS.activeHourStart,
    activeHourEnd:          row.active_hour_end         ?? DEFAULT_SETTINGS.activeHourEnd,
    premiumSource:          row.premium_source          ?? DEFAULT_SETTINGS.premiumSource,
    staleDataThresholdS:    row.stale_data_threshold_s  ?? DEFAULT_SETTINGS.staleDataThresholdS,
    replaySpeed:            row.replay_speed            ?? DEFAULT_SETTINGS.replaySpeed,
    replayDefaultDaysBack:  row.replay_default_days_back ?? DEFAULT_SETTINGS.replayDefaultDaysBack,
    autoTradeEnabled:           row.auto_trade_enabled              ?? DEFAULT_SETTINGS.autoTradeEnabled,
    autoTradeMaxPremium:        row.auto_trade_max_premium != null ? Number(row.auto_trade_max_premium) : DEFAULT_SETTINGS.autoTradeMaxPremium,
    autoTradeMinLiquidity:      row.auto_trade_min_liquidity != null ? Number(row.auto_trade_min_liquidity) : DEFAULT_SETTINGS.autoTradeMinLiquidity,
    autoTradeMinConfidenceClass: (row.auto_trade_min_confidence_class ?? DEFAULT_SETTINGS.autoTradeMinConfidenceClass) as SPXSettings['autoTradeMinConfidenceClass'],
    autoTradeChannelIds:        Array.isArray(row.auto_trade_channel_ids) ? row.auto_trade_channel_ids : DEFAULT_SETTINGS.autoTradeChannelIds,
    autoTradeTrackLifecycle:    row.auto_trade_track_lifecycle      ?? DEFAULT_SETTINGS.autoTradeTrackLifecycle,
    updatedAt:              row.updated_at              ?? DEFAULT_SETTINGS.updatedAt,
    updatedBy:              row.updated_by              ?? null,
  };
}

function settingsToDbRow(settings: Partial<SPXSettings>): Record<string, any> {
  const row: Record<string, any> = {};

  if (settings.engineEnabled          !== undefined) row.engine_enabled           = settings.engineEnabled;
  if (settings.paperMode              !== undefined) row.paper_mode               = settings.paperMode;
  if (settings.minScoreToAlert        !== undefined) row.min_score_to_alert       = settings.minScoreToAlert;
  if (settings.minScoreToTrade        !== undefined) row.min_score_to_trade       = settings.minScoreToTrade;
  if (settings.minDelta               !== undefined) row.min_delta                = settings.minDelta;
  if (settings.maxDelta               !== undefined) row.max_delta                = settings.maxDelta;
  if (settings.maxSpreadPct           !== undefined) row.max_spread_pct           = settings.maxSpreadPct;
  if (settings.minOI                  !== undefined) row.min_oi                   = settings.minOI;
  if (settings.minVolume              !== undefined) row.min_volume               = settings.minVolume;
  if (settings.prefer0DTE             !== undefined) row.prefer_0dte              = settings.prefer0DTE;
  if (settings.prefer1DTE             !== undefined) row.prefer_1dte              = settings.prefer1DTE;
  if (settings.preferWeekly           !== undefined) row.prefer_weekly            = settings.preferWeekly;
  if (settings.maxDTE                 !== undefined) row.max_dte                  = settings.maxDTE;
  if (settings.wallStrengthThreshold  !== undefined) row.wall_strength_threshold  = settings.wallStrengthThreshold;
  if (settings.wallDistanceThreshold  !== undefined) row.wall_distance_threshold  = settings.wallDistanceThreshold;
  if (settings.minShockSeverity       !== undefined) row.min_shock_severity       = settings.minShockSeverity;
  if (settings.minShockScore          !== undefined) row.min_shock_score          = settings.minShockScore;
  if (settings.flowAnomalySensitivity !== undefined) row.flow_anomaly_sensitivity = settings.flowAnomalySensitivity;
  if (settings.telegramEnabled        !== undefined) row.telegram_enabled         = settings.telegramEnabled;
  if (settings.telegramSendSignals    !== undefined) row.telegram_send_signals    = settings.telegramSendSignals;
  if (settings.telegramSendShock      !== undefined) row.telegram_send_shock      = settings.telegramSendShock;
  if (settings.telegramSendWall       !== undefined) row.telegram_send_wall       = settings.telegramSendWall;
  if (settings.telegramSendTrade      !== undefined) row.telegram_send_trade      = settings.telegramSendTrade;
  if (settings.dedupNewSignalS        !== undefined) row.dedup_new_signal_s       = settings.dedupNewSignalS;
  if (settings.dedupShockWarningS     !== undefined) row.dedup_shock_warning_s    = settings.dedupShockWarningS;
  if (settings.dedupWallAlertS        !== undefined) row.dedup_wall_alert_s       = settings.dedupWallAlertS;
  if (settings.dedupExitAlertS        !== undefined) row.dedup_exit_alert_s       = settings.dedupExitAlertS;
  if (settings.activeHourStart        !== undefined) row.active_hour_start        = settings.activeHourStart;
  if (settings.activeHourEnd          !== undefined) row.active_hour_end          = settings.activeHourEnd;
  if (settings.premiumSource          !== undefined) row.premium_source           = settings.premiumSource;
  if (settings.staleDataThresholdS    !== undefined) row.stale_data_threshold_s   = settings.staleDataThresholdS;
  if (settings.replaySpeed            !== undefined) row.replay_speed             = settings.replaySpeed;
  if (settings.replayDefaultDaysBack  !== undefined) row.replay_default_days_back = settings.replayDefaultDaysBack;
  if (settings.autoTradeEnabled             !== undefined) row.auto_trade_enabled                  = settings.autoTradeEnabled;
  if (settings.autoTradeMaxPremium          !== undefined) row.auto_trade_max_premium              = settings.autoTradeMaxPremium;
  if (settings.autoTradeMinLiquidity        !== undefined) row.auto_trade_min_liquidity            = settings.autoTradeMinLiquidity;
  if (settings.autoTradeMinConfidenceClass  !== undefined) row.auto_trade_min_confidence_class     = settings.autoTradeMinConfidenceClass;
  if (settings.autoTradeChannelIds          !== undefined) row.auto_trade_channel_ids              = settings.autoTradeChannelIds;
  if (settings.autoTradeTrackLifecycle      !== undefined) row.auto_trade_track_lifecycle          = settings.autoTradeTrackLifecycle;
  if (settings.updatedBy              !== undefined) row.updated_by               = settings.updatedBy;

  return row;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Reads the singleton spx_settings row.
 * Returns DEFAULT_SETTINGS on any error — never throws.
 */
export async function getSettings(): Promise<SPXSettings> {
  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from('spx_settings')
      .select('*')
      .limit(1)
      .single();

    if (error || !data) {
      console.warn('[settings-engine] getSettings: using defaults', error?.message);
      return { ...DEFAULT_SETTINGS };
    }

    return dbRowToSettings(data);
  } catch (err) {
    console.warn('[settings-engine] getSettings exception: using defaults', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Upserts the singleton spx_settings row with the provided patch.
 * Converts camelCase keys to snake_case before writing.
 * Returns the full updated settings.
 */
export async function updateSettings(
  patch: Partial<SPXSettings>,
  updatedBy?: string,
): Promise<SPXSettings> {
  const supabase = getServiceRoleClient();

  const dbPatch = settingsToDbRow(patch);
  // Always target the singleton row
  dbPatch.id = 'singleton';
  dbPatch.updated_at = new Date().toISOString();
  if (updatedBy !== undefined) dbPatch.updated_by = updatedBy;

  // Direct upsert — insert if row doesn't exist, update otherwise
  const { data, error } = await supabase
    .from('spx_settings')
    .upsert(dbPatch, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save spx_settings: ${error.message}`);
  return dbRowToSettings(data);
}

// ── ENGINE RUN LOGGING ────────────────────────────────────────────────────────

/**
 * Inserts a row into spx_engine_runs.
 * Never throws — all errors are caught and logged to console.
 */
export async function logEngineRun(params: {
  durationMs: number;
  success: boolean;
  signalType?: string;
  marketMode?: string;
  spxPrice?: number;
  errorMsg?: string;
  dataQuality?: 'high' | 'medium' | 'low';
}): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    const { error } = await supabase.from('spx_engine_runs').insert({
      duration_ms:   params.durationMs,
      success:       params.success,
      signal_type:   params.signalType   ?? null,
      market_mode:   params.marketMode   ?? null,
      spx_price:     params.spxPrice     ?? null,
      error_msg:     params.errorMsg     ?? null,
      data_quality:  params.dataQuality  ?? null,
      ran_at:        new Date().toISOString(),
    });
    if (error) {
      console.warn('[settings-engine] logEngineRun insert error:', error.message);
    }
  } catch (err) {
    console.warn('[settings-engine] logEngineRun exception:', err);
  }
}
