import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';
import { CreateTradeRequest } from '@/services/indices/types';

/**
 * POST /api/indices/analyses/[id]/trades
 * Create a new trade with real-time snapshot from Polygon
 *
 * This is the critical "publish trade" endpoint that:
 * 1. Validates user permissions
 * 2. Fetches real-time snapshots from Polygon for underlying + contract
 * 3. Stores entry prices and initializes high/low tracking
 * 4. Sets trade status to 'active'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const analysisId = params.id;

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify analysis exists and user owns it
    const { data: analysis, error: analysisError } = await supabase
      .from('index_analyses')
      .select('author_id, index_symbol')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }

    if (analysis.author_id !== user.id) {
      return NextResponse.json(
        { error: 'You can only add trades to your own analyses' },
        { status: 403 }
      );
    }

    const body: CreateTradeRequest = await request.json();

    // Validate required fields
    if (!body.instrument_type || !body.direction || !body.underlying_index_symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: instrument_type, direction, underlying_index_symbol' },
        { status: 400 }
      );
    }

    // Validate options-specific fields
    if (body.instrument_type === 'options') {
      if (!body.polygon_option_ticker || !body.strike || !body.expiry || !body.option_type) {
        return NextResponse.json(
          {
            error: 'Options trades require: polygon_option_ticker, strike, expiry, option_type',
          },
          { status: 400 }
        );
      }
    }

    // Get index reference to get polygon ticker
    const { data: indexRef, error: indexError } = await supabase
      .from('indices_reference')
      .select('polygon_index_ticker')
      .eq('index_symbol', body.underlying_index_symbol)
      .single();

    if (indexError || !indexRef) {
      return NextResponse.json(
        { error: `Invalid index symbol: ${body.underlying_index_symbol}` },
        { status: 400 }
      );
    }

    const polygonIndexTicker = indexRef.polygon_index_ticker;

    // CRITICAL: Fetch real-time snapshots from Polygon
    console.log('Fetching Polygon snapshots for trade publish...');

    let underlyingSnapshot;
    let contractSnapshot;

    try {
      // Fetch underlying index snapshot
      const indexSnap = await polygonService.getIndexSnapshot(polygonIndexTicker);
      underlyingSnapshot = {
        price: indexSnap.value,
        timestamp: indexSnap.timestamp,
        session_high: indexSnap.session.high,
        session_low: indexSnap.session.low,
        session_open: indexSnap.session.open,
        previous_close: indexSnap.session.previousClose,
      };

      // Fetch contract snapshot
      if (body.instrument_type === 'options' && body.polygon_option_ticker) {
        const optionSnap = await polygonService.getOptionSnapshot(
          body.underlying_index_symbol,
          body.polygon_option_ticker
        );
        contractSnapshot = {
          bid: optionSnap.quote?.bid,
          ask: optionSnap.quote?.ask,
          mid: optionSnap.quote?.mid || 0,
          last: optionSnap.quote?.last,
          timestamp: new Date().toISOString(),
          volume: optionSnap.quote?.volume,
          open_interest: optionSnap.quote?.openInterest,
          implied_volatility: optionSnap.quote?.impliedVolatility,
          delta: optionSnap.quote?.delta,
          gamma: optionSnap.quote?.gamma,
          theta: optionSnap.quote?.theta,
          vega: optionSnap.quote?.vega,
        };
      } else {
        // Futures: use underlying as contract price for now
        contractSnapshot = {
          mid: indexSnap.value,
          timestamp: indexSnap.timestamp,
        };
      }
    } catch (polygonError: any) {
      console.error('Polygon API error:', polygonError);
      return NextResponse.json(
        { error: `Failed to fetch market data: ${polygonError.message}` },
        { status: 503 }
      );
    }

    // Initialize current and high/low values with entry values
    const entryUnderlying = underlyingSnapshot.price;
    const entryContract = contractSnapshot.mid;

    // Create the trade
    const { data: trade, error: insertError } = await supabase
      .from('index_trades')
      .insert({
        analysis_id: analysisId,
        author_id: user.id,
        status: 'active', // Trade is active immediately upon publish
        instrument_type: body.instrument_type,
        direction: body.direction,
        underlying_index_symbol: body.underlying_index_symbol,
        polygon_underlying_index_ticker: polygonIndexTicker,
        polygon_option_ticker: body.polygon_option_ticker || null,
        strike: body.strike || null,
        expiry: body.expiry || null,
        option_type: body.option_type || null,
        entry_underlying_snapshot: underlyingSnapshot,
        entry_contract_snapshot: contractSnapshot,
        current_underlying: entryUnderlying,
        current_contract: entryContract,
        underlying_high_since: entryUnderlying,
        underlying_low_since: entryUnderlying,
        contract_high_since: entryContract,
        contract_low_since: entryContract,
        targets: body.targets || [],
        stoploss: body.stoploss || null,
        notes: body.notes || null,
        last_quote_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (insertError) {
      console.error('Error creating trade:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`Trade ${trade.id} published with entry prices:`, {
      underlying: entryUnderlying,
      contract: entryContract,
    });

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/analyses/[id]/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
