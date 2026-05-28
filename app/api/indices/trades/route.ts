import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { polygonService } from '@/services/indices/polygon.service';
import { CreateTradeRequest } from '@/services/indices/types';
import { tradeOutcomeService } from '@/services/indices/trade-outcome.service';

/**
 * Queue a `new_trade` Telegram announcement for a freshly created trade and
 * (best-effort) flush the outbox immediately. Used by both the normal
 * standalone-create path and the NEW_ENTRY re-entry path so a re-entered
 * trade is broadcast exactly like a brand-new one. No-op when
 * auto_publish_telegram is false. Never throws.
 */
async function publishNewTradeToTelegram(
  trade: any,
  body: CreateTradeRequest,
  snapshotUrl: string | null
): Promise<void> {
  if (!body.auto_publish_telegram) return;

  const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrlEnv || !serviceRoleKey) {
    console.warn('[trade-publish] ⚠️  Supabase service credentials missing — cannot publish to Telegram');
    return;
  }

  console.log(`[trade-publish] 📨 auto_publish_telegram=true — resolving channels for trade ${trade.id}...`);
  try {
    const channelsToPublish: string[] = [];

    if (body.is_testing && body.testing_channel_ids && body.testing_channel_ids.length > 0) {
      channelsToPublish.push(...body.testing_channel_ids);
      console.log(`[trade-publish] [Testing] Will publish to ${body.testing_channel_ids.length} testing channel(s)`);
    } else if (body.telegram_channel_id) {
      channelsToPublish.push(body.telegram_channel_id);
      console.log(`[trade-publish] [Production] Will publish to channel ${body.telegram_channel_id}`);
    }

    if (channelsToPublish.length === 0) {
      console.warn('[trade-publish] ⚠️  auto_publish_telegram=true but no channels resolved — nothing to send');
      return;
    }

    const adminClient = createClient(supabaseUrlEnv, serviceRoleKey);

    const tradeWithSnapshot = {
      ...trade,
      contract_url: snapshotUrl ?? trade.contract_url ?? null,
      analysis: {
        id: trade.id,
        title: 'Standalone Trade',
        index_symbol: trade.underlying_index_symbol,
      },
    };

    const outboxIds: string[] = [];

    for (const channelId of channelsToPublish) {
      let actualChannelId = channelId;

      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId)) {
        if (body.is_testing) {
          const { data: testChannel } = await adminClient
            .from("analyzer_testing_channels")
            .select("telegram_channel_id")
            .eq("id", channelId)
            .eq("is_enabled", true)
            .single();

          if (testChannel?.telegram_channel_id) {
            actualChannelId = testChannel.telegram_channel_id;
            console.log(`[trade-publish] [Testing] Resolved UUID ${channelId} → Telegram ID ${actualChannelId}`);
          } else {
            console.warn(`[trade-publish] [Testing] Could not resolve testing channel UUID ${channelId} — skipping`);
            continue;
          }
        } else {
          const { data: channel } = await adminClient
            .from("telegram_channels")
            .select("channel_id")
            .eq("id", channelId)
            .single();

          if (channel?.channel_id) {
            actualChannelId = channel.channel_id;
            console.log(`[trade-publish] [Production] Resolved UUID ${channelId} → Telegram ID ${actualChannelId}`);
          } else {
            console.warn(`[trade-publish] [Production] Could not resolve channel UUID ${channelId} — skipping`);
            continue;
          }
        }
      }

      const { data: outboxRow, error: outboxErr } = await adminClient
        .from("telegram_outbox")
        .insert({
          message_type: "new_trade",
          payload: {
            trade: tradeWithSnapshot,
            isTestingMode: body.is_testing || false,
          },
          channel_id: actualChannelId,
          status: "pending",
          priority: 5,
          next_retry_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (outboxErr) {
        console.error(`[trade-publish] ❌ Failed to insert outbox message for channel ${actualChannelId}:`, outboxErr.message);
      } else {
        outboxIds.push(outboxRow?.id);
        console.log(`[trade-publish] ✅ Queued outbox message ${outboxRow?.id} for channel ${actualChannelId} (isTestingMode=${body.is_testing || false})`);
      }
    }

    // Immediately trigger the outbox processor (fire-and-forget) so the message
    // is sent without waiting for a cron cycle.
    if (outboxIds.length > 0) {
      console.log(`[trade-publish] 🚀 Triggering telegram-outbox-processor to flush ${outboxIds.length} queued message(s)...`);
      (async () => {
        try {
          const processorRes = await fetch(`${supabaseUrlEnv}/functions/v1/telegram-outbox-processor`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ triggered_by: 'trade_create', trade_id: trade.id }),
          });
          const processorBody = await processorRes.json().catch(() => ({}));
          if (processorRes.ok) {
            console.log(`[trade-publish] ✅ Outbox processor completed:`, processorBody);
          } else {
            console.error(`[trade-publish] ❌ Outbox processor returned ${processorRes.status}:`, processorBody);
          }
        } catch (processorErr: any) {
          console.error('[trade-publish] ❌ Outbox processor trigger failed:', processorErr?.message);
        }
      })();
    }
  } catch (telegramError: any) {
    console.error('[trade-publish] ❌ Telegram publish error:', telegramError?.message);
  }
}

/**
 * GET /api/indices/trades
 * Fetch all standalone trades (trades without analysis) or all trades for admin
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

    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeAll = searchParams.get('all') === 'true';

    const buildQuery = (excludeTests: boolean) => {
      let q = supabase
        .from('index_trades')
        .select(`
          *,
          author:profiles!author_id(id, full_name, avatar_url),
          analysis:index_analyses(id, title)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (!includeAll) q = q.is('analysis_id', null);
      if (excludeTests) q = q.neq('is_test', true);
      if (status) q = q.eq('status', status);
      return q;
    };

    let { data: trades, error: tradesError } = await buildQuery(true);

    // Column doesn't exist yet (migration pending) — retry without filter
    if (tradesError?.code === '42703') {
      ({ data: trades, error: tradesError } = await buildQuery(false));
    }

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
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

    // Generate idempotency key (used for both re-entry detection preview and
    // the final insert / re-entry RPC calls).
    const idempotencyKey = body.idempotency_key ||
      `${user.id}_${body.polygon_option_ticker || `${body.strike}_${body.expiry}`}_${Date.now()}`;

    // ── Re-entry detection (runs BEFORE live pricing) ──────────────────────────
    // This MUST happen before the Polygon snapshot fetch and the "no valid entry
    // price" guard below. Otherwise, re-entering an *active* contract whose live
    // price can't be resolved (expiring/illiquid contract, or a closed market
    // without a manual price) fails with "No valid entry price" / a Polygon error
    // and the analyst never sees the re-entry decision dialog. The precise entry
    // price for the new leg is resolved later, when the decision is confirmed.
    if (body.instrument_type === 'options' && !body.reentry_decision) {
      const { data: activeTradeCheck, error: checkError } = await supabase.rpc(
        'check_active_trade_for_contract',
        {
          p_author_id: user.id,
          p_polygon_option_ticker: body.polygon_option_ticker || null,
          p_strike: body.strike || null,
          p_expiry: body.expiry || null,
          p_option_type: body.option_type || null,
          p_underlying_symbol: body.underlying_index_symbol,
        }
      );

      if (checkError) {
        console.error('[trade-create] check_active_trade_for_contract failed:', checkError.message);
      } else if (activeTradeCheck && activeTradeCheck.length > 0) {
        const existingTrade = activeTradeCheck[0];

        // Best-effort preview price for the new leg — never fatal. Prefer an
        // analyst-supplied value (override / manual price), then a quick live
        // quote, then fall back to the existing trade's last known price so the
        // dialog always shows something sensible.
        const manualBody = body as CreateTradeRequest & { current_price?: number; entry_price?: number };
        let previewEntry = Number(
          body.entry_override ?? manualBody.entry_price ?? manualBody.current_price ?? 0
        );
        if (!(previewEntry > 0) && body.polygon_option_ticker) {
          try {
            const snap = await polygonService.getOptionSnapshot(
              body.underlying_index_symbol,
              body.polygon_option_ticker
            );
            previewEntry = Number(snap.quote?.mid ?? 0);
          } catch (e: any) {
            console.warn('[trade-create] preview price fetch failed (non-fatal):', e?.message);
          }
        }
        if (!(previewEntry > 0)) {
          previewEntry = Number(existingTrade.max_contract_price) || Number(existingTrade.entry_price) || 0;
        }

        const previewQty = body.qty || 1;
        return NextResponse.json(
          {
            action_required: 'REENTRY_DECISION',
            message: 'An active trade already exists for this exact contract',
            existing_trade: {
              trade_id: existingTrade.trade_id,
              entry_price: existingTrade.entry_price,
              qty: existingTrade.qty,
              entry_cost_usd: existingTrade.entry_cost_usd,
              max_profit: existingTrade.max_profit,
              max_contract_price: existingTrade.max_contract_price,
            },
            new_trade: {
              entry_price: previewEntry,
              qty: previewQty,
              entry_cost_usd: previewEntry * previewQty * 100,
            },
            idempotency_key: idempotencyKey,
          },
          { status: 409 }
        );
      }
    }

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
            mid: optionSnap.quote?.mid ?? 0,
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
      const overrideVal = Number(body.entry_override);
      if (!Number.isFinite(overrideVal) || overrideVal <= 0) {
        return NextResponse.json(
          { error: 'entry_override must be a positive finite number' },
          { status: 400 }
        );
      }
      entryContract = overrideVal;
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

    // Handle re-entry decision
    if (body.reentry_decision) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      if (body.reentry_decision === 'NEW_ENTRY') {
        // Validate telegram_channel_id is a UUID if provided
        let validatedChannelId = null;
        if (body.telegram_channel_id) {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.telegram_channel_id);
          if (isUUID) {
            validatedChannelId = body.telegram_channel_id;
          } else {
            console.warn('telegram_channel_id is not a UUID, setting to null:', body.telegram_channel_id);
          }
        }

        // Close previous and create new
        const newTradeData = {
          author_id: user.id,
          analysis_id: null,
          status: 'active',
          instrument_type: body.instrument_type,
          direction: body.direction,
          underlying_index_symbol: body.underlying_index_symbol,
          polygon_underlying_index_ticker: polygonIndexTicker,
          polygon_option_ticker: body.polygon_option_ticker || null,
          strike: body.strike?.toString() || null,
          expiry: body.expiry || null,
          option_type: body.option_type || null,
          contract_multiplier: '100',
          entry_underlying_snapshot: underlyingSnapshot,
          entry_contract_snapshot: contractSnapshot,
          entry_cost_usd: (entryContract * (body.qty || 1) * 100).toString(),
          qty: (body.qty || 1).toString(),
          trade_price_basis: body.trade_price_basis || 'OPTION_PREMIUM',
          telegram_channel_id: validatedChannelId,
          telegram_send_enabled: 'true',
        };

        console.log('Calling process_trade_new_entry with:', {
          existing_trade_id: body.existing_trade_id,
          new_trade_data: newTradeData,
          idempotency_key: idempotencyKey,
        });

        const { data: result, error: processError } = await adminClient.rpc(
          'process_trade_new_entry',
          {
            p_existing_trade_id: body.existing_trade_id,
            p_new_trade_data: newTradeData,
            p_idempotency_key: idempotencyKey,
          }
        );

        if (processError) {
          console.error('Error processing NEW_ENTRY:', processError);
          console.error('Error details:', {
            message: processError.message,
            details: processError.details,
            hint: processError.hint,
            code: processError.code,
          });
          return NextResponse.json({
            error: processError.message,
            details: processError.details,
            hint: processError.hint,
          }, { status: 500 });
        }

        // Fetch the new trade with author data
        const { data: newTrade } = await supabase
          .from('index_trades')
          .select(`
            *,
            author:profiles!author_id(id, full_name, avatar_url)
          `)
          .eq('id', result.new_trade_id)
          .single();

        // Announce the re-entered trade on Telegram exactly like a fresh entry.
        // The outbox processor generates the alert image at send time.
        if (newTrade) {
          await publishNewTradeToTelegram(newTrade, body, newTrade.contract_url ?? null);
        }

        return NextResponse.json({
          trade: newTrade,
          reentry_result: result
        }, { status: 201 });

      } else if (body.reentry_decision === 'AVERAGE_ADJUSTMENT') {
        // Average the entry
        console.log('Calling process_trade_average_adjustment with:', {
          existing_trade_id: body.existing_trade_id,
          new_entry_price: entryContract,
          new_qty: body.qty || 1,
          idempotency_key: idempotencyKey,
        });

        const { data: result, error: processError } = await adminClient.rpc(
          'process_trade_average_adjustment',
          {
            p_existing_trade_id: body.existing_trade_id,
            p_new_entry_price: entryContract,
            p_new_qty: body.qty || 1,
            p_idempotency_key: idempotencyKey,
          }
        );

        if (processError) {
          console.error('Error processing AVERAGE_ADJUSTMENT:', processError);
          console.error('Error details:', {
            message: processError.message,
            details: processError.details,
            hint: processError.hint,
            code: processError.code,
          });
          return NextResponse.json({
            error: processError.message,
            details: processError.details,
            hint: processError.hint,
          }, { status: 500 });
        }

        // Fetch the updated trade with author data
        const { data: updatedTrade } = await supabase
          .from('index_trades')
          .select(`
            *,
            author:profiles!author_id(id, full_name, avatar_url)
          `)
          .eq('id', result.trade_id)
          .single();

        return NextResponse.json({
          trade: updatedTrade,
          reentry_result: result
        }, { status: 200 });
      } else {
        return NextResponse.json(
          { error: 'Invalid reentry_decision. Must be NEW_ENTRY or AVERAGE_ADJUSTMENT' },
          { status: 400 }
        );
      }
    }

    // Explicit entry price (set by analyst via the form's entry_override field)
    const explicitEntryPrice = body.entry_override !== undefined && body.entry_override !== null
      ? Number(body.entry_override)
      : entryContract;

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
        // Explicit entry price stored in its own column (new field from migration)
        entry_price: explicitEntryPrice,
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
        last_price_update_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        qty: body.qty || 1,
        idempotency_key: idempotencyKey,
        original_entry_price: entryContract,
        entry_cost_usd: entryContract * (body.qty || 1) * 100,
        max_contract_price: currentContractPrice,
        max_profit: 0,
        is_test: body.is_testing === true,
        // Buy range alert (optional — set when analyzer provides range params)
        buy_range_min: (body as any).buy_range_min || null,
        buy_range_max: (body as any).buy_range_max || null,
        buy_range_status: ((body as any).buy_range_min && (body as any).buy_range_max) ? 'pending' : null,
        buy_range_expires_at: (body as any).buy_range_expires_at || null,
        buy_range_telegram_channel_id: (body as any).buy_range_telegram_channel_id || null,
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

    // ── Snapshot generation ────────────────────────────────────────────────────
    // Snapshot is generated by calling the generate-trade-snapshot Supabase edge
    // function, which in turn fetches /api/indices/trades/{id}/generate-image.
    // In local dev (APP_BASE_URL not set) this is skipped intentionally; the
    // telegram-outbox-processor will re-attempt image generation at send time
    // using APP_BASE_URL from its own Supabase secrets.

    let snapshotUrl: string | null = null;
    const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://analyzinghub.com';
    const isLocalDev = appBaseUrl.includes('localhost');

    if (isLocalDev) {
      console.log('[trade-create] ⚠️  APP_BASE_URL is not set or points to localhost — skipping pre-generation snapshot.');
      console.log('[trade-create]    The telegram-outbox-processor will generate the image at send time using its own APP_BASE_URL secret.');
    } else if (supabaseUrlEnv && serviceRoleKey) {
      console.log(`[trade-create] 🖼  Generating snapshot for trade ${trade.id} via generate-trade-snapshot edge function...`);
      try {
        const snapshotResponse = await fetch(`${supabaseUrlEnv}/functions/v1/generate-trade-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            tradeId: trade.id,
            isNewHigh: false,
            appBaseUrl,
          }),
        });

        if (snapshotResponse.ok) {
          const result = await snapshotResponse.json();
          snapshotUrl = result.imageUrl || null;
          console.log(`[trade-create] ✅ Snapshot generated: ${snapshotUrl}`);
          trade.contract_url = snapshotUrl;

          const { error: urlUpdateError } = await supabase
            .from('index_trades')
            .update({ contract_url: snapshotUrl })
            .eq('id', trade.id);

          if (urlUpdateError) {
            console.error('[trade-create] ⚠️  Failed to persist snapshot URL:', urlUpdateError.message);
          } else {
            console.log(`[trade-create] ✅ Persisted snapshot URL to index_trades.contract_url`);
          }
        } else {
          const errorText = await snapshotResponse.text();
          console.error(`[trade-create] ⚠️  Snapshot edge function returned ${snapshotResponse.status}: ${errorText.substring(0, 300)}`);
          console.error('[trade-create]    Image will be generated at Telegram send time by the outbox processor.');
        }
      } catch (snapshotError: any) {
        console.error('[trade-create] ⚠️  Snapshot generation threw:', snapshotError?.message);
        console.error('[trade-create]    Image will be generated at Telegram send time by the outbox processor.');
      }
    }

    // ── Telegram publishing ────────────────────────────────────────────────────
    await publishNewTradeToTelegram(trade, body, snapshotUrl);

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
