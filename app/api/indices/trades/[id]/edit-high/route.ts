import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getMarketStatus } from '@/lib/market-hours';

export async function PATCH(
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

    // The profiles table stores the role as a foreign key (role_id) to the
    // roles table — it has no plain `role` text column. Read the role name via
    // the join, otherwise this check silently fails and an admin is never
    // recognised (blocking them from editing another analyst's trade).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .single();

    const roleName = (profile as any)?.role?.name;
    const isAdmin = roleName === 'SuperAdmin';

    const { data: trade, error: fetchError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, telegram_channel_id)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    if (trade.author_id !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the trade creator or admin can edit this trade' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { highWatermark, reason } = body;

    if (typeof highWatermark !== 'number' || highWatermark <= 0) {
      return NextResponse.json(
        { error: 'High watermark must be a positive number' },
        { status: 400 }
      );
    }

    const currentHigh = Math.max(
      trade.contract_high_since || 0,
      trade.max_contract_price || 0,
    );

    if (highWatermark === currentHigh) {
      return NextResponse.json(
        {
          message: 'High watermark unchanged',
          trade,
          telegramNotificationSent: false,
        },
        { status: 200 }
      );
    }

    // Guard: the high watermark must only move upward.  A manual edit to a
    // value lower than the current stored high would corrupt last_telegram_high_sent
    // and silently block future legitimate notifications.
    if (highWatermark < currentHigh) {
      return NextResponse.json(
        {
          error: `High watermark cannot be reduced. Current high is ${currentHigh}. To correct data, please contact an admin.`,
          currentHigh,
        },
        { status: 400 }
      );
    }

    const marketStatus = getMarketStatus();
    const entrySnapshot = trade.entry_contract_snapshot || {};
    const entryPrice = entrySnapshot.mid || entrySnapshot.price || entrySnapshot.last || 0;

    const now = new Date().toISOString();
    // Core update — only fields that have always existed in the schema.
    // New tracking columns (high_source, manual_high_updated_at) are written
    // in a separate best-effort call below so a stale PostgREST schema cache
    // never blocks the main price update.
    const updates: any = {
      contract_high_since: highWatermark,
      max_contract_price: highWatermark,
      previous_high_watermark: currentHigh,
      edited_by: user.id,
      edited_at: now,
      edit_reason: reason || 'Manual high watermark edit',
      manually_edited_high: true,
      updated_at: now,
    };

    if (entryPrice > 0) {
      updates.max_profit = (highWatermark - entryPrice) * (trade.qty || 1) * (trade.contract_multiplier || 100);
      updates.profit_from_entry = ((highWatermark - entryPrice) / entryPrice) * 100;
    }

    const profitDollars = updates.max_profit || 0;
    const isNowWinner = profitDollars >= 100;

    if (isNowWinner && !trade.is_winning_trade) {
      updates.is_winning_trade = true;
      updates.win_at = new Date().toISOString();
    }

    const { data: updatedTrade, error: updateError } = await supabase
      .from('index_trades')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        author:profiles!author_id(id, full_name, avatar_url)
      `)
      .single();

    if (updateError) {
      console.error('Error updating trade high watermark:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(`✅ [Edit High] Trade ${id} high watermark updated: $${currentHigh} → $${highWatermark}`);
    console.log(`📊 [Edit High] Market status: ${marketStatus.status}, Profit: $${profitDollars.toFixed(2)}`);

    // Best-effort: write new audit columns. Wrapped in its own try-catch so a
    // stale PostgREST schema cache (column not yet visible) never breaks the
    // main update that already succeeded above.
    supabase
      .from('index_trades')
      .update({ high_source: 'manual', manual_high_updated_at: now })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.warn('[Edit High] Could not write high_source/manual_high_updated_at (schema cache may be stale):', error.message);
      })
      .catch(() => {});

    let telegramNotificationSent = false;
    let snapshotGenerated = false;

    // A manual high edit ALWAYS warrants a notification as long as:
    //   (a) it is higher than the last value we already sent a Telegram for, AND
    //   (b) it exceeds the current stored high (enforced by the guard above).
    // Condition (b) is already guaranteed here — we only reach this point when
    // highWatermark > currentHigh — so (a) is the sole dedup gate.
    // No market-hours restriction for manual edits.
    const shouldNotifyTelegram = highWatermark > (trade.last_telegram_high_sent || 0);

    if (shouldNotifyTelegram) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Snapshot requires live chart data — only attempt when market is open
        let snapshotUrl: string | null = trade.contract_url || null;
        if (marketStatus.isOpen) {
          console.log(`📸 [Edit High] Generating snapshot (market open)...`);

          const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              tradeId: id,
              isNewHigh: true,
              newHighPrice: highWatermark,
              appBaseUrl: process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL,
            }),
          });

          if (snapshotResponse.ok) {
            const snapshotResult = await snapshotResponse.json();
            snapshotUrl = snapshotResult.imageUrl;
            console.log(`✅ [Edit High] Snapshot generated: ${snapshotUrl}`);
            snapshotGenerated = true;

            await supabase
              .from('index_trades')
              .update({ contract_url: snapshotUrl })
              .eq('id', id);

            updatedTrade.contract_url = snapshotUrl;
          } else {
            const errorText = await snapshotResponse.text();
            console.error(`❌ [Edit High] Failed to generate snapshot (${snapshotResponse.status}):`, errorText);
          }
        }

        const channelId = trade.telegram_channel_id || trade.analysis?.telegram_channel_id;
        if (channelId && trade.telegram_send_enabled !== false) {
          const { data: channel } = await supabase
            .from('telegram_channels')
            .select('channel_id')
            .eq('id', channelId)
            .single();

          const actualChannelId = channel?.channel_id || channelId;
          const gainPercent = entryPrice > 0 ? ((highWatermark - entryPrice) / entryPrice) * 100 : 0;

          // Update last_telegram_high_sent BEFORE inserting to the outbox so
          // that a concurrent request seeing the updated value skips the insert,
          // preventing duplicate notifications for the same manual high.
          await supabase
            .from('index_trades')
            .update({ last_telegram_high_sent: highWatermark })
            .eq('id', id);

          await supabase.from('telegram_outbox').insert({
            message_type: isNowWinner ? 'milestone' : 'new_high',
            payload: {
              tradeId: id,
              highPrice: highWatermark,
              previousHigh: currentHigh,
              gainPercent,
              snapshotUrl,
              isWinningTrade: isNowWinner,
              milestoneType: isNowWinner ? '$100_profit' : undefined,
              trade: { ...trade, ...updates, contract_url: snapshotUrl },
              manualEdit: true,
            },
            channel_id: actualChannelId,
            status: 'pending',
            priority: isNowWinner ? 10 : 5,
            next_retry_at: new Date().toISOString(),
          });

          telegramNotificationSent = true;
          console.log(`📤 [Edit High] Queued Telegram notification to channel ${actualChannelId}`);
        }
      } catch (notifError: any) {
        console.error('Error sending Telegram notification:', notifError);
      }
    } else {
      console.log(`ℹ️ [Edit High] Telegram notification skipped (not a new high, last_sent=${trade.last_telegram_high_sent})`);
    }

    return NextResponse.json({
      success: true,
      trade: updatedTrade,
      marketStatus: marketStatus.status,
      telegramNotificationSent,
      snapshotGenerated,
      message: telegramNotificationSent
        ? 'High watermark updated and Telegram notification sent'
        : `High watermark updated (no Telegram notification - ${shouldNotifyTelegram ? 'no channel configured' : 'not a new high'})`,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/indices/trades/[id]/edit-high:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
