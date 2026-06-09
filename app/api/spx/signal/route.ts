/**
 * GET /api/spx/signal
 *
 * Runs the full intelligence pipeline (features → walls → shock → signal)
 * and returns a SignalOutput plus the supporting context.
 *
 * Query params:
 *   skipWalls=true          — Skip wall engine (faster refresh)
 *   skipContracts=true      — Skip contract ranking
 *   history=20              — Number of past signal events to return (default 20)
 *
 * POST /api/spx/signal
 * Body: { signalId, resolution: 'tp_hit'|'sl_hit'|'expired'|'cancelled' }
 * Resolves an existing signal event.
 *
 * Auth: authenticated user required (any role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runIntelligenceEngine } from '@/services/spx/intelligence-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Internal cron access: the spx-engine-runner edge function calls this
    // endpoint on a schedule with the shared SPX_ENGINE_SECRET header. Without
    // this bypass the cron always received 401 and the engine never ran
    // automatically — it only ran while an admin had the Live panel open.
    const engineSecret = process.env.SPX_ENGINE_SECRET;
    const providedSecret = request.headers.get('x-spx-engine-secret');
    const isEngineCall = !!engineSecret && providedSecret === engineSecret;

    if (!isEngineCall) {
      const supabase = createServerClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const params = request.nextUrl.searchParams;
    const skipWalls = params.get('skipWalls') === 'true';
    const skipContracts = params.get('skipContracts') === 'true';
    const historyCount = Math.min(50, parseInt(params.get('history') || '20'));

    const result = await runIntelligenceEngine({
      skipWalls,
      skipContractRanking: skipContracts,
    });

    // Load signal history
    const serviceClient = createServiceRoleClient();
    const { data: signalHistory } = await serviceClient
      .from('spx_signal_events')
      .select(
        'id, created_at, signal_type, signal_mode, direction_bias, market_mode, ' +
        'underlying_price, composite_score, confidence_class, recommended_strike, ' +
        'recommended_expiry, recommended_option_type, rationale, expires_at, ' +
        'resolved_at, resolution_outcome',
      )
      .order('created_at', { ascending: false })
      .limit(historyCount);

    return NextResponse.json(
      {
        success: true,
        signal: result.signal,
        walls: result.walls,
        shock: result.shock,
        features: result.features,
        contracts: result.contracts,
        engineState: result.engineState,
        signalHistory: signalHistory ?? [],
        computedAt: result.computedAt,
      },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/signal]', err.message);
    return NextResponse.json(
      { error: err.message || 'Signal engine failed' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check analyzer/admin role for signal resolution
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { signalId, resolution } = body;

    if (!signalId || !resolution) {
      return NextResponse.json({ error: 'signalId and resolution are required' }, { status: 400 });
    }

    const validResolutions = ['tp_hit', 'sl_hit', 'expired', 'cancelled'];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { error: `resolution must be one of: ${validResolutions.join(', ')}` },
        { status: 400 },
      );
    }

    const serviceClient = createServiceRoleClient();
    const { error } = await serviceClient
      .from('spx_signal_events')
      .update({
        resolved_at: new Date().toISOString(),
        resolution_outcome: resolution,
      })
      .eq('id', signalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, signalId, resolution });
  } catch (err: any) {
    console.error('[POST /api/spx/signal]', err.message);
    return NextResponse.json(
      { error: err.message || 'Signal resolution failed' },
      { status: 500 },
    );
  }
}
