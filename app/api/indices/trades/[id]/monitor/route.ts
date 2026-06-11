/**
 * DELETE /api/indices/trades/[id]/monitor
 * Cancel a monitoring contract before it executes. The row stays in
 * status='monitoring' with monitor_status='cancelled' and is never counted as
 * a trade. Owner or SuperAdmin only (enforced inside the RPC).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tradeId } = await context.params;
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('cancel_contract_monitoring', {
      p_trade_id: tradeId,
    });

    if (error) {
      console.error('[monitor DELETE] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.ok) {
      return NextResponse.json({ error: data?.error ?? 'Failed to cancel monitoring' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, trade_id: tradeId });
  } catch (error: any) {
    console.error('[monitor DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
