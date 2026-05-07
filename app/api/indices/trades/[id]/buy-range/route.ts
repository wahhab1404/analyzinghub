/**
 * POST /api/indices/trades/[id]/buy-range   — set or update the buy range alert
 * DELETE /api/indices/trades/[id]/buy-range — cancel the buy range alert
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tradeId } = await context.params;
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { buy_range_min, buy_range_max, buy_range_expires_at, buy_range_telegram_channel_id } = body;

    if (!buy_range_min || !buy_range_max) {
      return NextResponse.json(
        { error: 'buy_range_min and buy_range_max are required' },
        { status: 400 }
      );
    }

    if (Number(buy_range_min) >= Number(buy_range_max)) {
      return NextResponse.json(
        { error: 'buy_range_min must be less than buy_range_max' },
        { status: 400 }
      );
    }

    console.log(`[buy-range POST] Setting buy range alert for trade ${tradeId}:`, {
      buy_range_min,
      buy_range_max,
      buy_range_expires_at,
      buy_range_telegram_channel_id,
    });

    const { data, error } = await supabase.rpc('set_buy_range_alert', {
      p_trade_id: tradeId,
      p_buy_range_min: Number(buy_range_min),
      p_buy_range_max: Number(buy_range_max),
      p_buy_range_expires_at: buy_range_expires_at || null,
      p_buy_range_channel_id: buy_range_telegram_channel_id || null,
    });

    if (error) {
      console.error(`[buy-range POST] RPC error:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.ok) {
      return NextResponse.json({ error: data?.error ?? 'Failed to set buy range alert' }, { status: 400 });
    }

    console.log(`[buy-range POST] ✅ Buy range alert set for trade ${tradeId}`);
    return NextResponse.json({ ok: true, trade_id: tradeId });
  } catch (error: any) {
    console.error('[buy-range POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tradeId } = await context.params;
    const supabase = createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[buy-range DELETE] Cancelling buy range alert for trade ${tradeId}`);

    const { data, error } = await supabase.rpc('cancel_buy_range_alert', {
      p_trade_id: tradeId,
    });

    if (error) {
      console.error(`[buy-range DELETE] RPC error:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.ok) {
      return NextResponse.json({ error: data?.error ?? 'Failed to cancel buy range alert' }, { status: 400 });
    }

    console.log(`[buy-range DELETE] ✅ Buy range alert cancelled for trade ${tradeId}`);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[buy-range DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
