/**
 * app/api/spx/trades/route.ts
 *
 * GET  /api/spx/trades  — List recent / active trades (any authenticated user)
 * POST /api/spx/trades  — Create or manage trades (Analyzer or SuperAdmin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { runIntelligenceEngine } from '@/services/spx/intelligence-engine';
import {
  createTradeFromSignal,
  getActiveTrades,
  getRecentTrades,
  updateTradeState,
  closeTrade,
} from '@/services/spx/trade-engine';
import type { TradeState } from '@/services/spx/trade-engine';
import { sendTradeClosedSummary } from '@/services/spx/spx-telegram';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── GET /api/spx/trades ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const stateFilter = params.get('state') ?? undefined;
    const limitParam = parseInt(params.get('limit') || '20');
    const limit = Math.min(50, Math.max(1, isNaN(limitParam) ? 20 : limitParam));

    const trades = await getRecentTrades(limit, stateFilter as TradeState | undefined);
    const activeTrades = await getActiveTrades();

    return NextResponse.json(
      { success: true, trades, activeTrades },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error('[GET /api/spx/trades]', err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch trades' },
      { status: 500 },
    );
  }
}

// ── POST /api/spx/trades ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    // ── create_from_signal ─────────────────────────────────────────────────────
    if (action === 'create_from_signal') {
      const { signalId } = body;
      if (!signalId) {
        return NextResponse.json({ error: 'signalId is required for create_from_signal' }, { status: 400 });
      }

      // Run intelligence engine (skipWalls: false — full run)
      const result = await runIntelligenceEngine({ skipWalls: false });

      if (!result.signal) {
        return NextResponse.json(
          { error: 'Intelligence engine produced no signal' },
          { status: 422 },
        );
      }

      const trade = await createTradeFromSignal(result.signal, result.features, result.contracts);

      return NextResponse.json({ success: true, trade }, { status: 201 });
    }

    // ── update_state ──────────────────────────────────────────────────────────
    if (action === 'update_state') {
      const { tradeId, newState, ...extra } = body;
      if (!tradeId || !newState) {
        return NextResponse.json(
          { error: 'tradeId and newState are required for update_state' },
          { status: 400 },
        );
      }

      await updateTradeState(tradeId, newState as TradeState, extra);

      return NextResponse.json({ success: true });
    }

    // ── close_trade ───────────────────────────────────────────────────────────
    if (action === 'close_trade') {
      const { tradeId, exitPremium, exitSpxPrice, exitReason } = body;
      if (!tradeId || exitPremium == null || exitSpxPrice == null || !exitReason) {
        return NextResponse.json(
          {
            error:
              'tradeId, exitPremium, exitSpxPrice, and exitReason are required for close_trade',
          },
          { status: 400 },
        );
      }

      await closeTrade(tradeId, exitPremium, exitSpxPrice, exitReason);

      // Fetch the updated trade to return and send the summary
      const { getTradeById } = await import('@/services/spx/trade-engine');
      const trade = await getTradeById(tradeId);

      // Non-fatal telegram summary
      if (trade) {
        try {
          await sendTradeClosedSummary(trade);
        } catch (telegramErr: any) {
          console.warn('[POST /api/spx/trades] sendTradeClosedSummary failed:', telegramErr.message);
        }
      }

      return NextResponse.json({ success: true, trade });
    }

    return NextResponse.json(
      {
        error: `Unknown action "${action}". Must be one of: create_from_signal, update_state, close_trade`,
      },
      { status: 400 },
    );
  } catch (err: any) {
    console.error('[POST /api/spx/trades]', err.message);
    return NextResponse.json(
      { error: err.message || 'Trade operation failed' },
      { status: 500 },
    );
  }
}
