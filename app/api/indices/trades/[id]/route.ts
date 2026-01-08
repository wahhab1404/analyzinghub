import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { UpdateTradeRequest } from '@/services/indices/types';

/**
 * GET /api/indices/trades/[id]
 * Get a single trade with updates
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const { id } = params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error in GET /api/indices/trades/[id]:', authError);
    }

    // Fetch trade
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq('id', id)
      .single();

    if (tradeError) {
      console.error('Error fetching trade:', tradeError, 'Trade ID:', id, 'User:', user?.id);
      return NextResponse.json({
        error: 'Trade not found',
        details: tradeError.message,
        tradeId: id
      }, { status: 404 });
    }

    if (!trade) {
      console.error('Trade not found in database, ID:', id, 'User:', user?.id);
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Fetch updates for this trade
    const { data: updates, error: updatesError } = await supabase
      .from('trade_updates')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .eq('trade_id', id)
      .order('created_at', { ascending: false });

    if (updatesError) {
      console.error('Error fetching trade updates:', updatesError);
    }

    return NextResponse.json({
      trade,
      updates: updates || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/trades/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/indices/trades/[id]
 * Update a trade (status, targets, stoploss, notes)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const { id } = params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user owns this trade
    const { data: existing, error: fetchError } = await supabase
      .from('index_trades')
      .select('author_id, status, targets, stoploss, notes, contract_high_since, contract_low_since')
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

    const body: UpdateTradeRequest = await request.json();

    // Build update object and track changes
    const updates: any = {
      updated_at: new Date().toISOString(),
    };
    const changes: Record<string, { old: any; new: any }> = {};

    if (body.status !== undefined && body.status !== existing.status) {
      updates.status = body.status;
      changes.status = { old: existing.status, new: body.status };

      // Set closed_at when closing
      if (body.status === 'closed' || body.status === 'canceled' || body.status === 'tp_hit' || body.status === 'sl_hit') {
        updates.closed_at = new Date().toISOString();
      }
    }

    if (body.targets !== undefined) {
      updates.targets = body.targets;
      if (JSON.stringify(body.targets) !== JSON.stringify(existing.targets)) {
        changes.targets = { old: existing.targets, new: body.targets };
      }
    }

    if (body.stoploss !== undefined) {
      updates.stoploss = body.stoploss;
      if (JSON.stringify(body.stoploss) !== JSON.stringify(existing.stoploss)) {
        changes.stoploss = { old: existing.stoploss, new: body.stoploss };
      }
    }

    if (body.notes !== undefined && body.notes !== existing.notes) {
      updates.notes = body.notes;
      changes.notes = { old: existing.notes, new: body.notes };
    }

    if ((body as any).manualContractHigh !== undefined) {
      const newHigh = (body as any).manualContractHigh;
      if (typeof newHigh === 'number' && newHigh > 0) {
        updates.manual_contract_high = newHigh;
        updates.contract_high_since = newHigh;
        changes.manual_contract_high = { old: existing.contract_high_since, new: newHigh };
      }
    }

    if ((body as any).manualContractLow !== undefined) {
      const newLow = (body as any).manualContractLow;
      if (typeof newLow === 'number' && newLow > 0) {
        updates.manual_contract_low = newLow;
        updates.contract_low_since = newLow;
        changes.manual_contract_low = { old: existing.contract_low_since, new: newLow };
      }
    }

    // Update the trade
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
      console.error('Error updating trade:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If there were changes, create an update record
    if (Object.keys(changes).length > 0) {
      const { error: updateInsertError } = await supabase
        .from('trade_updates')
        .insert({
          trade_id: id,
          author_id: user.id,
          body: 'Trade updated',
          changes,
        });

      if (updateInsertError) {
        console.error('Error creating trade update record:', updateInsertError);
      }
    }

    return NextResponse.json({ trade });
  } catch (error: any) {
    console.error('Error in PATCH /api/indices/trades/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/indices/trades/[id]
 * Delete a trade (Admin only)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const { id } = params;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || roleName !== 'SuperAdmin') {
      return NextResponse.json(
        { error: 'Only admins can delete trades' },
        { status: 403 }
      );
    }

    // Check if trade exists
    const { data: existing, error: fetchError } = await supabase
      .from('index_trades')
      .select('id, polygon_option_ticker, strike, direction')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Delete
    const { error: deleteError } = await supabase
      .from('index_trades')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting trade:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Trade ${existing.direction} ${existing.polygon_option_ticker} deleted successfully`
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/indices/trades/[id]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
