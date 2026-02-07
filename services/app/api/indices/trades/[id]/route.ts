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

    if (authError || !user) {
      console.error('Auth error in GET /api/indices/trades/[id]:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
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
        const currentHigh = existing.contract_high_since || 0;
        if (newHigh > currentHigh || currentHigh === 0) {
          updates.manual_contract_high = newHigh;
          updates.contract_high_since = newHigh;
          changes.manual_contract_high = { old: existing.contract_high_since, new: newHigh };
        } else {
          console.log(`⚠️ Ignoring manual high ${newHigh} - current high ${currentHigh} is already higher`);
        }
      }
    }

    if ((body as any).manualContractLow !== undefined) {
      const newLow = (body as any).manualContractLow;
      if (typeof newLow === 'number' && newLow > 0) {
        const currentLow = existing.contract_low_since || Infinity;
        if (newLow < currentLow || currentLow === Infinity) {
          updates.manual_contract_low = newLow;
          updates.contract_low_since = newLow;
          changes.manual_contract_low = { old: existing.contract_low_since, new: newLow };
        } else {
          console.log(`⚠️ Ignoring manual low ${newLow} - current low ${currentLow} is already lower`);
        }
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
  const params = await context.params;
  const { id } = params;

  console.log('=== DELETE Trade Start ===');
  console.log('Trade ID:', id);

  try {
    const supabase = createServerClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log('Auth check:', { hasUser: !!user, authError: authError?.message });

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    console.log('Fetching user profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle();

    console.log('Profile result:', { profile, profileError });

    if (profileError) {
      console.error('Error fetching profile for delete:', profileError);
      return NextResponse.json({
        error: 'Failed to verify permissions',
        details: profileError.message
      }, { status: 500 });
    }

    const roleName = (profile as any)?.role?.name;
    console.log('User role:', roleName);

    if (!profile || !roleName || roleName !== 'SuperAdmin') {
      return NextResponse.json(
        { error: 'Only admins can delete trades' },
        { status: 403 }
      );
    }

    // Check if trade exists
    console.log('Checking if trade exists...');
    const { data: existing, error: fetchError } = await supabase
      .from('index_trades')
      .select('id, polygon_option_ticker, strike, direction')
      .eq('id', id)
      .maybeSingle();

    console.log('Trade fetch result:', { existing, fetchError });

    if (fetchError) {
      console.error('Error fetching trade for delete:', fetchError);
      return NextResponse.json({
        error: 'Failed to fetch trade',
        details: fetchError.message
      }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Delete using the authenticated client
    console.log('Attempting delete...');
    const { error: deleteError, data: deleteData, status: deleteStatus, statusText } = await supabase
      .from('index_trades')
      .delete()
      .eq('id', id);

    console.log('Delete result:', {
      deleteError,
      deleteData,
      deleteStatus,
      statusText,
      hasError: !!deleteError
    });

    if (deleteError) {
      console.error('Delete failed:', deleteError);
      return NextResponse.json({
        error: 'Delete failed',
        message: deleteError.message,
        details: deleteError,
        tradeId: id
      }, { status: 500 });
    }

    console.log('=== DELETE Trade Success ===');
    return NextResponse.json({
      success: true,
      message: `Trade ${existing.direction} ${existing.polygon_option_ticker} deleted successfully`
    }, { status: 200 });
  } catch (error: any) {
    console.error('=== DELETE Trade Exception ===');
    console.error('Error:', error);
    console.error('Type:', typeof error);
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error?.message || 'Unknown error',
        type: error?.name || typeof error,
        tradeId: id
      },
      { status: 500 }
    );
  }
}
