import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getMarketStatus } from '@/lib/market-hours';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const { id } = params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('index_trades')
      .select('author_id, current_contract, contract_high_since, contract_low_since, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (existing.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only update your own trades' },
        { status: 403 }
      );
    }

    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: 'Can only update prices for active trades' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { manualPrice, manualHigh, manualLow } = body;

    const marketStatus = getMarketStatus();

    if (marketStatus.isOpen) {
      return NextResponse.json(
        {
          error: 'Cannot set manual prices during RTH. Live prices are being tracked.',
          marketStatus: marketStatus.status
        },
        { status: 400 }
      );
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };
    const changes: Record<string, { old: any; new: any }> = {};

    if (manualPrice !== undefined) {
      if (typeof manualPrice !== 'number' || manualPrice <= 0) {
        return NextResponse.json(
          { error: 'Manual price must be a positive number' },
          { status: 400 }
        );
      }

      updates.manual_contract_price = manualPrice;
      updates.current_contract = manualPrice;
      updates.is_using_manual_price = true;
      changes.manual_contract_price = { old: existing.current_contract, new: manualPrice };
    }

    if (manualHigh !== undefined) {
      if (typeof manualHigh !== 'number' || manualHigh <= 0) {
        return NextResponse.json(
          { error: 'Manual high must be a positive number' },
          { status: 400 }
        );
      }

      updates.manual_contract_high = manualHigh;
      updates.contract_high_since = manualHigh;
      changes.manual_contract_high = { old: existing.contract_high_since, new: manualHigh };
    }

    if (manualLow !== undefined) {
      if (typeof manualLow !== 'number' || manualLow <= 0) {
        return NextResponse.json(
          { error: 'Manual low must be a positive number' },
          { status: 400 }
        );
      }

      updates.manual_contract_low = manualLow;
      updates.contract_low_since = manualLow;
      changes.manual_contract_low = { old: existing.contract_low_since, new: manualLow };
    }

    const { data: trade, error: updateError } = await supabase
      .from('index_trades')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (updateError) {
      console.error('Error updating manual prices:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (Object.keys(changes).length > 0) {
      await supabase
        .from('trade_updates')
        .insert({
          trade_id: id,
          author_id: user.id,
          body: 'Manual price update (Outside RTH)',
          changes,
        });
    }

    return NextResponse.json({
      trade,
      message: 'Manual prices updated successfully',
      marketStatus: marketStatus.status
    });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades/[id]/manual-price:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
