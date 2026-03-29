/**
 * app/api/spx/health/route.ts
 *
 * GET /api/spx/health — Returns health/ops status for the SPX engine.
 * Any authenticated user.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getSettings } from '@/services/spx/settings-engine';

// ── SERVICE ROLE CLIENT ───────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── TYPES ─────────────────────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'error' | 'offline';
type DataGrade = 'high' | 'medium' | 'low' | 'offline';

// ── HELPERS ───────────────────────────────────────────────────────────────────

function secondsAgo(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  return (Date.now() - new Date(isoString).getTime()) / 1000;
}

function startOfTodayUTC(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const checkedAt = new Date().toISOString();

  try {
    // Auth check
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const db = getServiceRoleClient();

    // ── Fetch settings (for stale threshold) ──────────────────────────────
    const settings = await getSettings();
    const staleThresholdS = settings.staleDataThresholdS ?? 120;

    // ── 1. Engine state ────────────────────────────────────────────────────
    const { data: engineStateRow } = await db
      .from('spx_engine_state')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // ── 2. Price history ───────────────────────────────────────────────────
    const { count: priceCount } = await db
      .from('spx_price_history')
      .select('id', { count: 'exact', head: true });

    const { data: latestPriceRow } = await db
      .from('spx_price_history')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .single();

    const lastPriceAt: string | null = latestPriceRow?.captured_at ?? null;
    const priceAgeS = secondsAgo(lastPriceAt);
    const isPriceStale = priceAgeS === null || priceAgeS > staleThresholdS;

    // ── 3. Open trades ─────────────────────────────────────────────────────
    const { count: openTradeCount } = await db
      .from('spx_trades')
      .select('id', { count: 'exact', head: true })
      .not('state', 'in', '("closed_win","closed_loss","expired","cancelled","invalidated")');

    // ── 4. Alert log (today) ───────────────────────────────────────────────
    const todayStart = startOfTodayUTC();

    const { count: alertsTodayCount } = await db
      .from('spx_alert_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart);

    const { data: lastAlertRow } = await db
      .from('spx_alert_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ── 5. Telegram channels ───────────────────────────────────────────────
    const { count: telegramChannelCount } = await db
      .from('telegram_channels')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true);

    // ── 6. Engine runs (last 100, last 24h analysis) ───────────────────────
    const { data: recentRuns } = await db
      .from('spx_engine_runs')
      .select('success,error_msg,ran_at')
      .order('ran_at', { ascending: false })
      .limit(100);

    const runs: any[] = recentRuns ?? [];
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const runs24h = runs.filter(r => r.ran_at >= cutoff24h);
    const errorRuns24h = runs24h.filter(r => !r.success);
    const successRate24h = runs24h.length > 0
      ? (runs24h.length - errorRuns24h.length) / runs24h.length
      : 1;
    const lastError = runs.find(r => !r.success)?.error_msg ?? null;

    // Last run timestamp
    const lastRunAt: string | null = runs[0]?.ran_at ?? null;
    const lastRunAgeS = secondsAgo(lastRunAt);

    // Engine state fields
    const isRunning: boolean = engineStateRow?.is_running ?? false;
    const marketMode: string | null = engineStateRow?.market_mode ?? null;
    const underlyingPrice: number | null = engineStateRow?.underlying_price ?? null;
    const engineUpdatedAt: string | null = engineStateRow?.updated_at ?? null;

    // ── 7. Signals today ──────────────────────────────────────────────────
    const { count: signalsTodayCount } = await db
      .from('spx_signal_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart);

    const { data: lastSignalRow } = await db
      .from('spx_signal_events')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // ── Determine overall status ───────────────────────────────────────────
    const noPriceData = (priceCount ?? 0) === 0;
    const engineNotRun = lastRunAgeS === null || lastRunAgeS > 15 * 60; // 15+ min
    const errorRate = runs24h.length > 0 ? errorRuns24h.length / runs24h.length : 0;
    const lastRunHadError = runs[0] ? !runs[0].success : false;
    const ranRecently5m = lastRunAgeS !== null && lastRunAgeS <= 5 * 60;
    const ranRecently15m = lastRunAgeS !== null && lastRunAgeS <= 15 * 60;

    let status: HealthStatus;

    if (noPriceData || engineNotRun) {
      status = 'offline';
    } else if (errorRate > 0.2 || lastRunHadError) {
      status = 'error';
    } else if (!ranRecently5m || errorRate > 0 || isPriceStale) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    // ── dataQuality warnings ───────────────────────────────────────────────
    const warnings: string[] = [];
    if (isPriceStale) warnings.push(`Price data is stale (last update ${Math.round(priceAgeS ?? 0)}s ago, threshold ${staleThresholdS}s)`);
    if (noPriceData) warnings.push('No price history data available');
    if (errorRate > 0.2) warnings.push(`High error rate in last 24h: ${(errorRate * 100).toFixed(1)}%`);
    if (errorRate > 0 && errorRate <= 0.2) warnings.push(`Some errors in last 24h: ${errorRuns24h.length}/${runs24h.length} runs failed`);
    if (!isRunning) warnings.push('Engine is not currently marked as running');

    let dataGrade: DataGrade;
    if (noPriceData) {
      dataGrade = 'offline';
    } else if (!isPriceStale && errorRate === 0 && (signalsTodayCount ?? 0) > 0) {
      dataGrade = 'high';
    } else if (!isPriceStale && errorRate <= 0.2) {
      dataGrade = 'medium';
    } else {
      dataGrade = 'low';
    }

    // ── Build response ─────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      checkedAt,
      status,
      engine: {
        isRunning,
        lastRunAt,
        runsLast24h: runs24h.length,
        errorCount24h: errorRuns24h.length,
        successRate24h,
        lastError,
        marketMode,
        underlyingPrice,
        updatedAt: engineUpdatedAt,
      },
      polygon: {
        configured: !!process.env.POLYGON_API_KEY,
        lastPriceAt,
        isStale: isPriceStale,
        staleThresholdS,
      },
      supabase: {
        connected: true,
        priceHistoryCount: priceCount ?? 0,
        lastPriceAt,
        openTrades: openTradeCount ?? 0,
      },
      telegram: {
        configured: settings.telegramEnabled,
        channelCount: telegramChannelCount ?? 0,
        alertsToday: alertsTodayCount ?? 0,
        lastAlertAt: lastAlertRow?.created_at ?? null,
      },
      dataQuality: {
        grade: dataGrade,
        lastSignalAt: lastSignalRow?.created_at ?? null,
        signalsToday: signalsTodayCount ?? 0,
        warnings,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/spx/health]', err);

    // Return a degraded-but-valid response rather than a 500 when possible
    return NextResponse.json(
      {
        success: false,
        checkedAt,
        status: 'error' as HealthStatus,
        error: err?.message ?? 'Internal server error',
      },
      { status: 500 },
    );
  }
}
