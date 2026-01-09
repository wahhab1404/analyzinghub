import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';
import { CreateTradeRequest } from '@/services/indices/types';

/**
 * GET /api/indices/trades
 * Fetch all standalone trades (trades without analysis)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .is('analysis_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: trades, error: tradesError } = await query;

    if (tradesError) {
      console.error('Error fetching standalone trades:', tradesError);
      return NextResponse.json({ error: tradesError.message }, { status: 500 });
    }

    return NextResponse.json({ trades: trades || [] });
  } catch (error: any) {
    console.error('Error in GET /api/indices/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/indices/trades
 * Create a standalone trade (without analysis)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.roles?.name;
    if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
      return NextResponse.json(
        { error: 'Only admins and analyzers can create trades' },
        { status: 403 }
      );
    }

    const body: CreateTradeRequest = await request.json();

    if (!body.instrument_type || !body.direction || !body.underlying_index_symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: instrument_type, direction, underlying_index_symbol' },
        { status: 400 }
      );
    }

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

    let underlyingSnapshot;
    let contractSnapshot;
    let isManualPriceEntry = false;

    const bodyWithManualPrices = body as CreateTradeRequest & {
      current_price?: number;
      entry_price?: number;
    };

    if (bodyWithManualPrices.current_price) {
      console.log('Using manual price entry (markets closed)...');
      isManualPriceEntry = true;

      underlyingSnapshot = {
        price: 0,
        timestamp: new Date().toISOString(),
        session_high: 0,
        session_low: 0,
        session_open: 0,
        previous_close: 0,
      };

      const entryPrice = bodyWithManualPrices.entry_price || bodyWithManualPrices.current_price;
      contractSnapshot = {
        bid: bodyWithManualPrices.current_price,
        ask: bodyWithManualPrices.current_price,
        mid: entryPrice,
        last: bodyWithManualPrices.current_price,
        timestamp: new Date().toISOString(),
        volume: 0,
        open_interest: 0,
      };
    } else {
      console.log('Fetching Polygon snapshots for standalone trade...');

      try {
        const indexSnap = await polygonService.getIndexSnapshot(polygonIndexTicker);
        underlyingSnapshot = {
          price: indexSnap.value,
          timestamp: indexSnap.timestamp,
          session_high: indexSnap.session.high,
          session_low: indexSnap.session.low,
          session_open: indexSnap.session.open,
          previous_close: indexSnap.session.previousClose,
        };

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
    }

    const entryUnderlying = underlyingSnapshot.price;
    let entryContract = contractSnapshot.mid;
    let currentContractPrice = contractSnapshot.mid;
    let entrySource: 'polygon' | 'manual' = isManualPriceEntry ? 'manual' : 'polygon';
    let overrideReason: string | null = isManualPriceEntry ? 'Manual price entry (markets closed)' : null;

    if (isManualPriceEntry && bodyWithManualPrices.current_price) {
      currentContractPrice = bodyWithManualPrices.current_price;
    }

    if (body.entry_override !== undefined && body.entry_override !== null) {
      entryContract = body.entry_override;
      entrySource = 'manual';
      overrideReason = body.entry_override_reason || 'Manual entry override';
    }

    if (!entryContract || entryContract === 0) {
      return NextResponse.json(
        {
          error: 'No valid entry price available. Markets may be closed or contract has no liquidity.',
          details: {
            contractSnapshot,
            marketStatus: 'Options markets are open Monday-Friday 9:30 AM - 4:15 PM ET',
          }
        },
        { status: 400 }
      );
    }

    const initialHigh = Math.max(entryContract, currentContractPrice);
    const initialLow = Math.min(entryContract, currentContractPrice);

    const { data: trade, error: insertError } = await supabase
      .from('index_trades')
      .insert({
        analysis_id: null,
        author_id: user.id,
        status: 'active',
        instrument_type: body.instrument_type,
        direction: body.direction,
        underlying_index_symbol: body.underlying_index_symbol,
        polygon_underlying_index_ticker: polygonIndexTicker,
        polygon_option_ticker: body.polygon_option_ticker || null,
        strike: body.strike || null,
        expiry: body.expiry || null,
        option_type: body.option_type || null,
        trade_price_basis: body.trade_price_basis || 'OPTION_PREMIUM',
        entry_price_source: entrySource,
        entry_override_reason: overrideReason,
        entry_underlying_snapshot: underlyingSnapshot,
        entry_contract_snapshot: contractSnapshot,
        current_underlying: entryUnderlying,
        current_contract: currentContractPrice,
        underlying_high_since: entryUnderlying,
        underlying_low_since: entryUnderlying,
        contract_high_since: initialHigh,
        contract_low_since: initialLow,
        manual_contract_price: isManualPriceEntry ? bodyWithManualPrices.current_price : null,
        is_using_manual_price: isManualPriceEntry,
        targets: body.targets || [],
        stoploss: body.stoploss || null,
        notes: body.notes || null,
        contract_url: null,
        telegram_channel_id: body.telegram_channel_id || null,
        telegram_send_enabled: true,
        last_quote_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        qty: body.qty || 1,
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (insertError) {
      console.error('Error creating standalone trade:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`Standalone trade ${trade.id} created with entry price:`, {
      underlying: entryUnderlying,
      contract: entryContract,
      source: entrySource,
    });

    let snapshotUrl: string | null = null;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        console.log('Generating snapshot for standalone trade:', trade.id);
        const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            tradeId: trade.id,
            isNewHigh: false,
          }),
        });

        if (snapshotResponse.ok) {
          const result = await snapshotResponse.json();
          snapshotUrl = result.imageUrl;
          console.log('Snapshot generated successfully:', snapshotUrl);
          trade.contract_url = snapshotUrl;

          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          const errorText = await snapshotResponse.text();
          console.error('Snapshot generation failed:', errorText);
        }
      }
    } catch (snapshotError) {
      console.error('Failed to generate snapshot:', snapshotError);
    }

    if (body.auto_publish_telegram && body.telegram_channel_id) {
      try {
        console.log(`Publishing standalone trade ${trade.id} to Telegram channel ${body.telegram_channel_id}`);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && serviceRoleKey) {
          const tradeWithMockAnalysis = {
            ...trade,
            analysis: {
              id: trade.id,
              title: 'Standalone Trade',
              index_symbol: trade.underlying_index_symbol,
            },
          };

          const response = await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              type: 'new_trade',
              data: tradeWithMockAnalysis,
              channelId: body.telegram_channel_id,
              isNewHigh: false,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Telegram trade publish failed:', errorText);
          } else {
            const result = await response.json();
            console.log('Successfully published standalone trade to Telegram:', result);
          }
        }
      } catch (telegramError) {
        console.error('Failed to publish standalone trade to Telegram:', telegramError);
      }
    }

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
