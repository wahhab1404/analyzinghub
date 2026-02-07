import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { CreateTradeUpdateRequest } from '@/services/indices/types';

/**
 * POST /api/indices/trades/[id]/updates
 * Post an update to a trade
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const tradeId = params.id;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify trade exists and user owns it
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('author_id')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (trade.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only post updates to your own trades' },
        { status: 403 }
      );
    }

    const body: CreateTradeUpdateRequest = await request.json();

    if (!body.body) {
      return NextResponse.json(
        { error: 'Missing required field: body' },
        { status: 400 }
      );
    }

    const { data: update, error: insertError } = await supabase
      .from('trade_updates')
      .insert({
        trade_id: tradeId,
        author_id: user.id,
        body: body.body,
        attachment_url: body.attachment_url || null,
        changes: body.changes || {},
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (insertError) {
      console.error('Error creating trade update:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ update }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades/[id]/updates:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
