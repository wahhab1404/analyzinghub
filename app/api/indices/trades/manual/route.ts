import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Queue a Telegram announcement for a manually-entered trade and (best-effort)
 * flush the outbox immediately — mirrors the standalone-trade publish path so a
 * quick manual deal is broadcast exactly like a live one. Winning trades use the
 * `winning_trade` card (entry → peak profit); the rest use `new_trade`.
 * No-op when auto_publish is false or no channel is provided. Never throws.
 */
async function publishManualTradeToTelegram(
  trade: any,
  channelUuid: string | null,
  isWinning: boolean
): Promise<void> {
  if (!channelUuid) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[manual-trade] ⚠️  Supabase service credentials missing — cannot publish to Telegram');
    return;
  }

  try {
    const admin = createAdminClient(supabaseUrl, serviceRoleKey);

    // Resolve the channel UUID to the actual Telegram chat_id.
    let actualChannelId = channelUuid;
    if (UUID_RE.test(channelUuid)) {
      const { data: channel } = await admin
        .from('telegram_channels')
        .select('channel_id')
        .eq('id', channelUuid)
        .single();

      if (!channel?.channel_id) {
        console.warn(`[manual-trade] Could not resolve channel UUID ${channelUuid} — skipping`);
        return;
      }
      actualChannelId = channel.channel_id;
    }

    const tradeWithAnalysis = {
      ...trade,
      analysis: {
        id: trade.id,
        title: 'Manual Trade',
        index_symbol: trade.underlying_index_symbol,
      },
    };

    const { error: outboxErr } = await admin.from('telegram_outbox').insert({
      message_type: isWinning ? 'winning_trade' : 'new_trade',
      payload: {
        trade: tradeWithAnalysis,
        isTestingMode: false,
        ...(isWinning ? { highPrice: trade.contract_high_since } : {}),
      },
      channel_id: actualChannelId,
      status: 'pending',
      priority: 5,
      next_retry_at: new Date().toISOString(),
    });

    if (outboxErr) {
      console.error(`[manual-trade] ❌ Failed to queue outbox message: ${outboxErr.message}`);
      return;
    }
    console.log(`[manual-trade] ✅ Queued ${isWinning ? 'winning_trade' : 'new_trade'} to outbox for channel ${actualChannelId}`);

    // Fire-and-forget: trigger the outbox processor so it sends without waiting
    // for the cron cycle.
    ;(async () => {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/telegram-outbox-processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ triggered_by: 'manual_trade_create', trade_id: trade.id }),
        });
        const resBody = await res.json().catch(() => ({}));
        console.log('[manual-trade] ✅ Outbox processor completed:', resBody);
      } catch (procErr: any) {
        console.error('[manual-trade] ❌ Outbox processor trigger failed:', procErr?.message);
      }
    })();
  } catch (telegramError: any) {
    console.error('[manual-trade] ❌ Telegram publish error:', telegramError?.message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { index_symbol, strike, entry_price, high_price, direction } = body;

    // Telegram publishing (opt-in). Only a valid channel UUID is honoured.
    const autoPublishTelegram = body.auto_publish_telegram === true;
    const telegramChannelId =
      autoPublishTelegram && typeof body.telegram_channel_id === 'string' && UUID_RE.test(body.telegram_channel_id)
        ? body.telegram_channel_id
        : null;

    if (!index_symbol || !strike || !entry_price || !high_price || !direction) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const strikeNum = parseFloat(strike);
    const entryNum = parseFloat(entry_price);
    const highNum = parseFloat(high_price);

    if (isNaN(strikeNum) || isNaN(entryNum) || isNaN(highNum)) {
      return NextResponse.json(
        { error: 'Invalid number format' },
        { status: 400 }
      );
    }

    if (highNum < entryNum) {
      return NextResponse.json(
        { error: 'High price must be greater than or equal to entry price' },
        { status: 400 }
      );
    }

    const multiplier = 100;
    const qty = 1;
    const profitPercent = ((highNum - entryNum) / entryNum) * 100;
    const profitDollars = (highNum - entryNum) * multiplier * qty;

    const entrySnapshot = {
      price: entryNum,
      mid: entryNum,
      last: entryNum,
      bid: entryNum - 0.05,
      ask: entryNum + 0.05,
      volume: 0,
      open_interest: 0,
      timestamp: new Date().toISOString(),
    };

    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + 7);
    const expiryStr = expiry.toISOString().split('T')[0];

    const isWinning = profitDollars >= 100;
    const status = isWinning ? 'closed' : 'active';

    const { data: trade, error: insertError } = await supabase
      .from('index_trades')
      .insert({
        author_id: user.id,
        underlying_index_symbol: index_symbol,
        strike: strikeNum,
        direction,
        option_type: direction,
        expiry: expiryStr,
        entry_contract_snapshot: entrySnapshot,
        current_contract: highNum,
        contract_high_since: highNum,
        status,
        qty,
        contract_multiplier: multiplier,
        pnl_usd: profitDollars,
        final_profit: profitDollars,
        is_winning_trade: isWinning,
        is_manual_entry: true,
        telegram_channel_id: telegramChannelId,
        telegram_send_enabled: !!telegramChannelId,
        is_testing: false,
        testing_channel_ids: []
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating manual trade:', insertError);
      return NextResponse.json(
        { error: 'Failed to create trade' },
        { status: 500 }
      );
    }

    if (isWinning && trade) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        console.log(`📸 [Manual Trade] Generating snapshot for new winning trade ID: ${trade.id}`);
        console.log(`📊 [Manual Trade] Trade details: Entry=$${entryNum}, High=$${highNum}, Profit=${profitPercent.toFixed(2)}%`);
        console.log(`🔗 [Manual Trade] Calling: ${supabaseUrl}/functions/v1/generate-trade-snapshot`);

        const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            tradeId: trade.id,
            isNewHigh: true,
            newHighPrice: highNum,
            appBaseUrl: process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL,
          }),
        });

        console.log(`📡 [Manual Trade] Snapshot response status: ${snapshotResponse.status}`);

        if (snapshotResponse.ok) {
          const snapshotResult = await snapshotResponse.json();
          const snapshotUrl = snapshotResult.imageUrl;
          console.log(`✅ [Manual Trade] Snapshot generated successfully: ${snapshotUrl}`);

          await supabase
            .from('index_trades')
            .update({ contract_url: snapshotUrl })
            .eq('id', trade.id);

          trade.contract_url = snapshotUrl;
        } else {
          const errorText = await snapshotResponse.text();
          console.error(`❌ [Manual Trade] Failed to generate snapshot (${snapshotResponse.status}):`, errorText);
        }
      } catch (snapshotError: any) {
        console.error('❌ [Manual Trade] Exception generating snapshot:', snapshotError.message);
        console.error('Stack:', snapshotError.stack);
      }
    }

    // Publish to Telegram if a channel was selected (best-effort, never blocks).
    if (trade) {
      await publishManualTradeToTelegram(trade, telegramChannelId, isWinning);
    }

    return NextResponse.json({
      success: true,
      trade,
      published_to_telegram: !!telegramChannelId,
      calculated: {
        profitPercent: profitPercent.toFixed(2),
        profitDollars: profitDollars.toFixed(2),
        isWinning,
      },
    });
  } catch (error: any) {
    console.error('Error in manual trade creation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
