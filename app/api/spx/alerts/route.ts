/**
 * app/api/spx/alerts/route.ts
 *
 * GET /api/spx/alerts
 *
 * Returns a paginated, filterable list of alert log entries from spx_alert_log,
 * along with aggregate statistics.
 *
 * Auth: Analyzer or SuperAdmin only.
 *
 * Query params:
 *   limit          — max rows to return (default 50, max 100)
 *   alertType      — filter to a specific alert type (optional)
 *   suppressedOnly — when "true", return only suppressed alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Inline type for spx_alert_log rows ────────────────────────────────────────

export interface AlertLogRow {
  id: string;
  created_at: string;
  alert_type: string;
  signal_id: string | null;
  trade_id: string | null;
  telegram_message_id: number | null;
  telegram_chat_id: string | null;
  suppressed: boolean;
  suppression_reason: string | null;
  payload: Record<string, unknown> | null;
  error: string | null;
  delivered_at: string | null;
}

// ── GET /api/spx/alerts ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Auth
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role check — Analyzer or SuperAdmin only
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const limitParam = parseInt(params.get('limit') || '50');
    const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 50 : limitParam));
    const alertType = params.get('alertType') ?? null;
    const suppressedOnly = params.get('suppressedOnly') === 'true';

    const serviceClient = createServiceRoleClient();

    // ── Build query ──────────────────────────────────────────────────────────
    let query = serviceClient
      .from('spx_alert_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (alertType) {
      query = query.eq('alert_type', alertType);
    }

    if (suppressedOnly) {
      query = query.eq('suppressed', true);
    }

    const { data: alerts, error: queryError } = await query;

    if (queryError) {
      console.error('[GET /api/spx/alerts] DB query failed:', queryError.message);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    const rows = (alerts ?? []) as AlertLogRow[];

    // ── Compute stats ────────────────────────────────────────────────────────
    const suppressed = rows.filter((r) => r.suppressed).length;

    const byType: Record<string, number> = {};
    for (const row of rows) {
      const t = row.alert_type ?? 'unknown';
      byType[t] = (byType[t] ?? 0) + 1;
    }

    const stats = {
      total: rows.length,
      suppressed,
      byType,
    };

    return NextResponse.json(
      { success: true, alerts: rows, stats },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/alerts]', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch alerts' },
      { status: 500 },
    );
  }
}
