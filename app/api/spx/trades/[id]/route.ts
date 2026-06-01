/**
 * app/api/spx/trades/[id]/route.ts
 *
 * GET   /api/spx/trades/[id]  — Fetch a single trade (any authenticated user)
 * PATCH /api/spx/trades/[id]  — Update premium / state / close a trade (Analyzer or SuperAdmin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  getTradeById,
  refreshTradePremium,
  updateTradeState,
  closeTrade,
} from '@/services/spx/trade-engine';
import type { TradeState, SPXTrade } from '@/services/spx/trade-engine';
import { checkExitConditions, persistExitSignal } from '@/services/spx/exit-engine';
import type { ExitSignal } from '@/services/spx/exit-engine';
import { sendTradeClosedSummary } from '@/services/spx/spx-telegram';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── GET /api/spx/trades/[id] ──────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const trade = await getTradeById(params.id);
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, trade },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error(`[GET /api/spx/trades/${params?.id}]`, err.message);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch trade' },
      { status: 500 },
    );
  }
}

// ── PATCH /api/spx/trades/[id] ────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const {
      currentPremium,
      currentSpxPrice,
      newState,
      exitPremium,
      exitSpxPrice,
      exitReason,
    } = body;

    let trade: SPXTrade | null = await getTradeById(params.id);
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    const exitSignals: ExitSignal[] = [];

    // ── 1. Premium refresh ────────────────────────────────────────────────────
    if (currentPremium != null) {
      await refreshTradePremium(params.id, currentPremium, currentSpxPrice);
      // Re-fetch trade to get updated fields (highest_premium, lowest_premium, etc.)
      trade = (await getTradeById(params.id)) ?? trade;

      // Check if any profit targets have been hit
      const targets: Array<{ label: string; value: number | null }> = [
        { label: 'target1', value: (trade as any).target1Premium ?? null },
        { label: 'target2', value: (trade as any).target2Premium ?? null },
        { label: 'target3', value: (trade as any).target3Premium ?? null },
      ];

      // Check exit conditions
      try {
        const triggered = await checkExitConditions(trade, currentPremium, currentSpxPrice);
        for (const condition of triggered) {
          const signal = await persistExitSignal(trade, condition);
          exitSignals.push(signal);
        }
      } catch (exitErr: any) {
        console.warn(`[PATCH /api/spx/trades/${params.id}] Exit condition check failed:`, exitErr.message);
      }
    }

    // ── 2. State update ───────────────────────────────────────────────────────
    if (newState != null) {
      await updateTradeState(params.id, newState as TradeState);
      trade = (await getTradeById(params.id)) ?? trade;
    }

    // ── 3. Close trade ────────────────────────────────────────────────────────
    if (exitPremium != null) {
      if (exitSpxPrice == null || !exitReason) {
        return NextResponse.json(
          { error: 'exitSpxPrice and exitReason are required when exitPremium is provided' },
          { status: 400 },
        );
      }

      await closeTrade(params.id, exitPremium, exitSpxPrice, exitReason);
      trade = (await getTradeById(params.id)) ?? trade;

      try {
        const channelIds: string[] = Array.isArray((trade as any).autoChannelIds)
          ? (trade as any).autoChannelIds
          : [];
        await sendTradeClosedSummary(trade, channelIds);
      } catch (telegramErr: any) {
        console.warn(
          `[PATCH /api/spx/trades/${params.id}] sendTradeClosedSummary failed:`,
          telegramErr.message,
        );
      }
    }

    return NextResponse.json(
      { success: true, trade, exitSignals },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error(`[PATCH /api/spx/trades/${params?.id}]`, err.message);
    return NextResponse.json(
      { error: err.message || 'Trade update failed' },
      { status: 500 },
    );
  }
}
