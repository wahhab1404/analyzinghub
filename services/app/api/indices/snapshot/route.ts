import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { SnapshotGeneratorService } from '@/services/indices/snapshot-generator.service';

/**
 * POST /api/indices/snapshot
 * Generate a visual snapshot HTML for a trade
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tradeId, isNewHigh } = body;

    if (!tradeId) {
      return NextResponse.json({ error: 'Trade ID required' }, { status: 400 });
    }

    // Fetch trade with all necessary data
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Check if user owns this trade
    if (trade.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only generate snapshots for your own trades' },
        { status: 403 }
      );
    }

    // Generate snapshot data
    const snapshotData = SnapshotGeneratorService.prepareSnapshotData(trade, isNewHigh);

    // Generate HTML
    const html = SnapshotGeneratorService.generateSnapshotHTML(snapshotData);

    return NextResponse.json({
      html,
      snapshotData,
    });
  } catch (error: any) {
    console.error('Error in POST /api/indices/snapshot:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/indices/snapshot?tradeId=xxx&isNewHigh=true
 * Render snapshot HTML directly (for screenshot services)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;
    const tradeId = searchParams.get('tradeId');
    const isNewHigh = searchParams.get('isNewHigh') === 'true';

    if (!tradeId) {
      return new Response('Trade ID required', { status: 400 });
    }

    // Fetch trade with all necessary data
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, index_symbol)
      `)
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new Response('Trade not found', { status: 404 });
    }

    // Generate snapshot data
    const snapshotData = SnapshotGeneratorService.prepareSnapshotData(trade, isNewHigh);

    // Generate HTML
    const html = SnapshotGeneratorService.generateSnapshotHTML(snapshotData);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/indices/snapshot:', error);
    return new Response(error.message || 'Internal server error', { status: 500 });
  }
}
