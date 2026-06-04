/**
 * app/api/spx/trades/[id]/suspend/route.ts
 *
 * POST /api/spx/trades/[id]/suspend  — Manually suspend or resume an SPX trade.
 *
 * A suspended trade leaves the ACTIVE_STATES set, so the intelligence engine and
 * the realtime premium tracker stop following it. A Telegram notice is sent to
 * the trade's auto channels on both suspend and resume.
 *
 * Body: { action?: 'suspend' | 'resume', reason?: string }
 * Allowed for Analyzer or SuperAdmin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getTradeById } from '@/services/spx/trade-engine';
import { sendContractSuspendedAlert, sendContractResumedAlert } from '@/services/spx/spx-telegram';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles!inner(name)')
      .eq('id', user.id)
      .single();
    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action: 'suspend' | 'resume' = body?.action === 'resume' ? 'resume' : 'suspend';
    const reason: string | null = typeof body?.reason === 'string' ? body.reason.trim() : null;

    const trade = await getTradeById(params.id);
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (action === 'suspend' && trade.state === 'suspended') {
      return NextResponse.json({ error: 'Trade is already suspended' }, { status: 409 });
    }
    if (action === 'resume' && trade.state !== 'suspended') {
      return NextResponse.json(
        { error: `Only suspended trades can be resumed (current state: ${trade.state})` },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const admin = createServiceRoleClient();

    const updateRow =
      action === 'suspend'
        ? {
            state: 'suspended',
            suspended_at: now,
            suspended_by: user.id,
            suspension_reason: reason,
            suspension_mode: 'manual',
            updated_at: now,
          }
        : {
            state: 'active',
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
            suspension_mode: null,
            updated_at: now,
          };

    const { error: updateError } = await admin
      .from('spx_trades')
      .update(updateRow)
      .eq('id', params.id);

    if (updateError) {
      console.error(`[POST /api/spx/trades/${params.id}/suspend]`, updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Best-effort Telegram notice — never block the state change on it.
    try {
      const channelIds: string[] = Array.isArray((trade as any).autoChannelIds)
        ? (trade as any).autoChannelIds
        : [];
      if (action === 'suspend') {
        await sendContractSuspendedAlert(trade, reason, channelIds);
      } else {
        await sendContractResumedAlert(trade, channelIds);
      }
    } catch (telegramErr: any) {
      console.warn(`[POST /api/spx/trades/${params.id}/suspend] alert failed:`, telegramErr.message);
    }

    const updated = await getTradeById(params.id);
    return NextResponse.json(
      { success: true, action, trade: updated },
      { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    );
  } catch (err: any) {
    console.error(`[POST /api/spx/trades/${params?.id}/suspend]`, err.message);
    return NextResponse.json(
      { error: err.message || 'Suspend failed' },
      { status: 500 },
    );
  }
}
