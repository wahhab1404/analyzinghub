/**
 * app/api/spx/analytics/route.ts
 *
 * GET /api/spx/analytics — Returns aggregated analytics for SPX signals and trades.
 * Any authenticated user. Query param: days (default 30, max 365).
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

// ── SERVICE ROLE CLIENT ───────────────────────────────────────────────────────

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:00 ${suffix}`;
}

const SCORE_BUCKETS = [
  { bucket: '0-29',  min: 0,  max: 29  },
  { bucket: '30-44', min: 30, max: 44  },
  { bucket: '45-59', min: 45, max: 59  },
  { bucket: '60-74', min: 60, max: 74  },
  { bucket: '75-89', min: 75, max: 89  },
  { bucket: '90-100', min: 90, max: 100 },
];

function isWin(outcome: string | null | undefined): boolean {
  return outcome === 'big_win' || outcome === 'small_win';
}

function isLoss(outcome: string | null | undefined): boolean {
  return outcome === 'big_loss' || outcome === 'small_loss';
}

function safeAvg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const rawDays = parseInt(searchParams.get('days') ?? '30', 10);
    const days = isNaN(rawDays) ? 30 : Math.min(Math.max(rawDays, 1), 365);

    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    const db = getServiceRoleClient();

    // ── 1. Fetch signal events ──────────────────────────────────────────────
    const { data: signalRows, error: signalError } = await db
      .from('spx_signal_events')
      .select('id,signal_type,signal_mode,confidence_class,composite_score,created_at,resolution_outcome')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    if (signalError) {
      console.error('[analytics] signal fetch error', signalError.message);
    }
    const signals: any[] = signalRows ?? [];

    // ── 2. Fetch trades ─────────────────────────────────────────────────────
    const { data: tradeRows, error: tradeError } = await db
      .from('spx_trades')
      .select('id,signal_event_id,state,option_type,dte,entry_premium,exit_premium,realized_pnl_pct,mfe,mae,final_score_outcome,exit_timestamp,created_at')
      .gte('created_at', fromIso);

    if (tradeError) {
      console.error('[analytics] trade fetch error', tradeError.message);
    }
    const trades: any[] = tradeRows ?? [];

    // ── 3. Compute summary ─────────────────────────────────────────────────
    const closedStates = new Set(['closed_win', 'closed_loss', 'expired', 'cancelled', 'invalidated']);
    const closedTrades = trades.filter(t => closedStates.has(t.state));
    const openTrades = trades.filter(t => !closedStates.has(t.state));
    const actionableSignals = signals.filter(s =>
      s.signal_type === 'BUY_CALL' || s.signal_type === 'BUY_PUT'
    );

    const closedWins = closedTrades.filter(t => isWin(t.final_score_outcome));
    const closedLosses = closedTrades.filter(t => isLoss(t.final_score_outcome));

    const winRate = closedTrades.length > 0 ? closedWins.length / closedTrades.length : 0;
    const falsePosRate = closedTrades.length > 0 ? closedLosses.length / closedTrades.length : 0;

    const pnlValues = closedTrades
      .filter(t => t.realized_pnl_pct != null)
      .map(t => t.realized_pnl_pct as number);
    const expectancy = safeAvg(pnlValues);

    const mfeValues = closedTrades
      .filter(t => t.mfe != null)
      .map(t => t.mfe as number);
    const avgMFE = safeAvg(mfeValues);

    const maeValues = closedTrades
      .filter(t => t.mae != null)
      .map(t => t.mae as number);
    const avgMAE = safeAvg(maeValues);

    const winPremiumExpansions = closedWins
      .filter(t => t.entry_premium != null && t.exit_premium != null && t.entry_premium > 0)
      .map(t => (t.exit_premium - t.entry_premium) / t.entry_premium);
    const avgPremiumExpansion = safeAvg(winPremiumExpansions);

    const signalPrecision = actionableSignals.length > 0
      ? trades.length / actionableSignals.length
      : 0;

    // ── 4. byMode ──────────────────────────────────────────────────────────
    const modeMap = new Map<string, { signals: any[]; trades: any[] }>();
    for (const s of signals) {
      const mode = s.signal_mode ?? 'Unknown';
      if (!modeMap.has(mode)) modeMap.set(mode, { signals: [], trades: [] });
      modeMap.get(mode)!.signals.push(s);
    }
    for (const t of trades) {
      const sigId = t.signal_event_id;
      const sig = signals.find(s => s.id === sigId);
      const mode = sig?.signal_mode ?? 'Unknown';
      if (!modeMap.has(mode)) modeMap.set(mode, { signals: [], trades: [] });
      modeMap.get(mode)!.trades.push(t);
    }
    const byMode = Array.from(modeMap.entries()).map(([mode, { signals: ms, trades: mt }]) => {
      const closed = mt.filter(t => closedStates.has(t.state));
      const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
      const losses = closed.filter(t => isLoss(t.final_score_outcome)).length;
      const wr = closed.length > 0 ? wins / closed.length : 0;
      const pnls = closed.filter(t => t.realized_pnl_pct != null).map(t => t.realized_pnl_pct as number);
      return {
        mode,
        signalCount: ms.length,
        tradeCount: mt.length,
        wins,
        losses,
        winRate: wr,
        avgPnl: safeAvg(pnls),
      };
    });

    // ── 5. byConfidence ────────────────────────────────────────────────────
    const confMap = new Map<string, { signals: any[]; trades: any[] }>();
    for (const s of signals) {
      const cls = s.confidence_class ?? 'Unknown';
      if (!confMap.has(cls)) confMap.set(cls, { signals: [], trades: [] });
      confMap.get(cls)!.signals.push(s);
    }
    for (const t of trades) {
      const sigId = t.signal_event_id;
      const sig = signals.find(s => s.id === sigId);
      const cls = sig?.confidence_class ?? 'Unknown';
      if (!confMap.has(cls)) confMap.set(cls, { signals: [], trades: [] });
      confMap.get(cls)!.trades.push(t);
    }
    const byConfidence = Array.from(confMap.entries()).map(([cls, { signals: cs, trades: ct }]) => {
      const closed = ct.filter(t => closedStates.has(t.state));
      const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
      const wr = closed.length > 0 ? wins / closed.length : 0;
      const pnls = closed.filter(t => t.realized_pnl_pct != null).map(t => t.realized_pnl_pct as number);
      return {
        class: cls,
        signalCount: cs.length,
        tradeCount: ct.length,
        winRate: wr,
        avgPnl: safeAvg(pnls),
      };
    });

    // ── 6. byHour ──────────────────────────────────────────────────────────
    const hourMap = new Map<number, { signals: any[]; trades: any[] }>();
    for (const s of signals) {
      const hour = new Date(s.created_at).getUTCHours();
      if (!hourMap.has(hour)) hourMap.set(hour, { signals: [], trades: [] });
      hourMap.get(hour)!.signals.push(s);
    }
    for (const t of trades) {
      const hour = new Date(t.created_at).getUTCHours();
      if (!hourMap.has(hour)) hourMap.set(hour, { signals: [], trades: [] });
      hourMap.get(hour)!.trades.push(t);
    }
    const byHour = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, { signals: hs, trades: ht }]) => {
        const closed = ht.filter(t => closedStates.has(t.state));
        const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
        const wr = closed.length > 0 ? wins / closed.length : 0;
        return {
          hour,
          label: hourLabel(hour),
          signalCount: hs.length,
          tradeCount: ht.length,
          winRate: wr,
        };
      });

    // ── 7. byContractType ──────────────────────────────────────────────────
    const ctMap = new Map<string, any[]>();
    for (const t of trades) {
      const ct = t.option_type ?? 'unknown';
      if (!ctMap.has(ct)) ctMap.set(ct, []);
      ctMap.get(ct)!.push(t);
    }
    const byContractType = Array.from(ctMap.entries()).map(([type, ts]) => {
      const closed = ts.filter(t => closedStates.has(t.state));
      const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
      const wr = closed.length > 0 ? wins / closed.length : 0;
      const pnls = closed.filter(t => t.realized_pnl_pct != null).map(t => t.realized_pnl_pct as number);
      return {
        type,
        count: ts.length,
        winRate: wr,
        avgPnl: safeAvg(pnls),
      };
    });

    // ── 8. byDTERegime ─────────────────────────────────────────────────────
    const dteRegimeOf = (dte: number | null): string => {
      if (dte === null || dte === undefined) return 'Unknown';
      if (dte === 0) return '0DTE';
      if (dte === 1) return '1DTE';
      if (dte <= 7) return 'Weekly';
      if (dte <= 30) return 'Monthly';
      return 'Other';
    };

    const dteMap = new Map<string, any[]>();
    for (const t of trades) {
      const regime = dteRegimeOf(t.dte);
      if (!dteMap.has(regime)) dteMap.set(regime, []);
      dteMap.get(regime)!.push(t);
    }
    const byDTERegime = Array.from(dteMap.entries()).map(([regime, ts]) => {
      const closed = ts.filter(t => closedStates.has(t.state));
      const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
      const wr = closed.length > 0 ? wins / closed.length : 0;
      const pnls = closed.filter(t => t.realized_pnl_pct != null).map(t => t.realized_pnl_pct as number);
      return {
        regime,
        count: ts.length,
        winRate: wr,
        avgPnl: safeAvg(pnls),
      };
    });

    // ── 9. byScoreBucket ───────────────────────────────────────────────────
    const byScoreBucket = SCORE_BUCKETS.map(({ bucket, min, max }) => {
      const bucketSignals = signals.filter(s => {
        const score = s.composite_score;
        return score != null && score >= min && score <= max;
      });
      const sigIds = new Set(bucketSignals.map(s => s.id));
      const bucketTrades = trades.filter(t => t.signal_event_id && sigIds.has(t.signal_event_id));
      const closed = bucketTrades.filter(t => closedStates.has(t.state));
      const wins = closed.filter(t => isWin(t.final_score_outcome)).length;
      const wr = closed.length > 0 ? wins / closed.length : 0;
      const pnls = closed.filter(t => t.realized_pnl_pct != null).map(t => t.realized_pnl_pct as number);
      return {
        bucket,
        min,
        max,
        signalCount: bucketSignals.length,
        tradeCount: bucketTrades.length,
        winRate: wr,
        avgPnl: safeAvg(pnls),
      };
    });

    // ── 10. Recent closed trades (camelCase, joined with signal for mode/score) ──
    const signalById = new Map(signals.map(s => [s.id, s]));
    const recentClosedTrades = closedTrades
      .sort((a, b) => new Date(b.exit_timestamp ?? b.created_at).getTime() - new Date(a.exit_timestamp ?? a.created_at).getTime())
      .slice(0, 10)
      .map(t => {
        const sig = signalById.get(t.signal_event_id);
        return {
          id:            t.id,
          date:          t.exit_timestamp ?? t.created_at,
          type:          (t.option_type ?? '').toUpperCase(),
          mode:          sig?.signal_mode ?? 'Unknown',
          score:         sig?.composite_score ?? 0,
          entryPremium:  t.entry_premium  ?? 0,
          exitPremium:   t.exit_premium   ?? 0,
          pnlPct:        t.realized_pnl_pct ?? 0,
          outcome:       t.final_score_outcome ?? 'unknown',
        };
      });

    // ── Response — rates as 0-100 percentages ─────────────────────────────
    return NextResponse.json({
      success: true,
      period: { from: fromIso, to: toIso, days },
      summary: {
        totalSignals:        signals.length,
        actionableSignals:   actionableSignals.length,
        totalTrades:         trades.length,
        closedTrades:        closedTrades.length,
        openTrades:          openTrades.length,
        winRate:             winRate * 100,
        expectancy,
        avgMFE,
        avgMAE,
        avgPremiumExpansion: avgPremiumExpansion * 100,
        signalPrecision:     signalPrecision * 100,
        falsePosRate:        falsePosRate * 100,
      },
      byMode:         byMode.map(r => ({ ...r, winRate: r.winRate * 100 })),
      byConfidence:   byConfidence.map(r => ({ ...r, winRate: r.winRate * 100 })),
      byHour:         byHour.map(r => ({ ...r, winRate: (r.winRate ?? 0) * 100 })),
      byContractType: byContractType.map(r => ({ ...r, winRate: r.winRate * 100 })),
      byDTERegime:    byDTERegime.map(r => ({ ...r, winRate: r.winRate * 100 })),
      byScoreBucket:  byScoreBucket.map(r => ({ ...r, winRate: r.winRate * 100 })),
      recentClosedTrades,
    });
  } catch (err: any) {
    console.error('[GET /api/spx/analytics]', err);
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
