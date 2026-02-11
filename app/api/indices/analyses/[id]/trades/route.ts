import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { polygonService } from '@/services/indices/polygon.service';
import { CreateTradeRequest } from '@/services/indices/types';

/**
 * GET /api/indices/analyses/[id]/trades
 * Fetch all trades for a specific analysis
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
    const analysisId = params.id;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: trades, error: tradesError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
      return NextResponse.json({ error: tradesError.message }, { status: 500 });
    }

    return NextResponse.json({ trades: trades || [] });
  } catch (error: any) {
    console.error('Error in GET /api/indices/analyses/[id]/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const params = await context.params;
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
      console.log('Fetching Polygon snapshots for trade publish...');

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
          error: 'No valid entry price available. This usually means:\n' +
                 '1. Market is closed (Options trade 9:30 AM - 4:15 PM ET)\n' +
                 '2. Contract has no liquidity/quotes\n' +
                 '3. Wrong contract ticker\n\n' +
                 'Please try again during market hours or use manual entry override.',
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

    const contractUrl: string | null = null;

    let telegramChannelId = body.telegram_channel_id || null;

    const { data: trade, error: insertError } = await supabase
      .from('index_trades')
      .insert({
        analysis_id: analysisId,
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
        contract_url: contractUrl,
        telegram_channel_id: telegramChannelId,
        telegram_send_enabled: true,
        last_quote_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        is_testing: body.is_testing || false,
        testing_channel_ids: [],
      })
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url),
        analysis:index_analyses!analysis_id(id, title, index_symbol, telegram_channel_id)
      `)
      .single();

    if (insertError) {
      console.error('Error creating trade:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`Trade ${trade.id} published with entry prices:`, {
      underlying: entryUnderlying,
      contract: entryContract,
      source: entrySource,
    });

    // Generate snapshot image and wait for completion
    let snapshotUrl: string | null = null;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        console.log('Generating snapshot for trade:', trade.id);
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

          // Update trade with snapshot URL in memory and database
          trade.contract_url = snapshotUrl;

          // Save the snapshot URL to the database
          await supabase
            .from('index_trades')
            .update({ contract_url: snapshotUrl })
            .eq('id', trade.id);

          console.log(`✅ Updated trade ${trade.id} with snapshot URL in database`);
        } else {
          const errorText = await snapshotResponse.text();
          console.error('Snapshot generation failed:', errorText);
        }
      }
    } catch (snapshotError) {
      console.error('Failed to generate snapshot:', snapshotError);
    }

    // Publish to Telegram if requested
    if (body.auto_publish_telegram) {
      try {
        const channelsToPublish: string[] = [];

        // For test trades, use testing channels
        if (body.is_testing && body.testing_channel_ids && body.testing_channel_ids.length > 0) {
          channelsToPublish.push(...body.testing_channel_ids);
          console.log(`Publishing test trade ${trade.id} to ${body.testing_channel_ids.length} testing channels`);
        } else {
          // For regular trades, determine which channel to use (trade override > analysis default)
          let channelId = trade.telegram_channel_id;

          if (!channelId) {
            const { data: analysisData } = await supabase
              .from('index_analyses')
              .select('telegram_channel_id')
              .eq('id', analysisId)
              .maybeSingle();

            channelId = analysisData?.telegram_channel_id;
          }

          if (channelId) {
            channelsToPublish.push(channelId);
          }
        }

        if (channelsToPublish.length > 0) {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (supabaseUrl && serviceRoleKey) {
            // Publish to all channels
            for (const channelId of channelsToPublish) {
              console.log(`Publishing trade ${trade.id} to Telegram channel ${channelId}`);

              const response = await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  type: 'new_trade',
                  data: trade,
                  channelId: channelId,
                  isNewHigh: false,
                  isTestingMode: body.is_testing || false,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                console.error(`Telegram trade publish to ${channelId} failed:`, errorText);
              } else {
                const result = await response.json();
                console.log(`Successfully published trade to Telegram channel ${channelId}:`, result);
              }
            }
          } else {
            console.error('Missing Supabase URL or service role key for Telegram publishing');
          }
        } else {
          console.log('No telegram channels configured for this trade');
        }
      } catch (telegramError) {
        console.error('Failed to publish trade to Telegram:', telegramError);
        // Don't fail the request if Telegram fails
      }
    }

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/analyses/[id]/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
