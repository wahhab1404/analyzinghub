import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/indices/trades/[id]/suspend
 *
 * Manually suspend (or resume) an index/options contract. A suspended contract
 * keeps its row but is dropped from every price-tracking and auto-close query
 * (those only look at status = 'active'), so the platform stops following it.
 *
 * Body: { action?: 'suspend' | 'resume', reason?: string }
 *   - 'suspend' (default): status → 'suspended', records who/why, and queues a
 *                          Telegram suspension notice to the trade's channel.
 *   - 'resume':            status → 'active' so tracking picks it back up, and
 *                          queues a resume notice.
 *
 * Allowed for the trade owner or a SuperAdmin.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await context.params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action: 'suspend' | 'resume' = body?.action === 'resume' ? 'resume' : 'suspend';
    const reason: string = typeof body?.reason === 'string' ? body.reason.trim() : '';

    // Load the trade + its analysis (for the Telegram channel + display fields)
    const { data: trade, error: fetchError } = await supabase
      .from('index_trades')
      .select(`
        id, author_id, status, telegram_channel_id,
        underlying_index_symbol, strike, option_type, direction,
        polygon_option_ticker, current_contract,
        original_entry_price, entry_price, entry_contract_snapshot, qty, contract_multiplier,
        analysis:index_analyses!analysis_id(id, title, telegram_channel_id)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Permission: owner or SuperAdmin
    if (trade.author_id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role:roles!inner(name)')
        .eq('id', user.id)
        .maybeSingle();
      const roleName = (profile as any)?.role?.name;
      if (roleName !== 'SuperAdmin') {
        return NextResponse.json(
          { error: 'You can only suspend your own contracts' },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    if (action === 'suspend') {
      if (trade.status === 'suspended') {
        return NextResponse.json({ error: 'Contract is already suspended' }, { status: 409 });
      }
      // Only contracts that are still being tracked can be suspended.
      if (trade.status !== 'active') {
        return NextResponse.json(
          { error: `Only active contracts can be suspended (current status: ${trade.status})` },
          { status: 409 }
        );
      }
    } else if (trade.status !== 'suspended') {
      return NextResponse.json(
        { error: `Only suspended contracts can be resumed (current status: ${trade.status})` },
        { status: 409 }
      );
    }

    // A suspended contract counts as a FULL LOSS until resumed: lose the entire
    // entry cost. These are the same outcome fields the canonical expired-trades
    // closer writes for a losing trade, so analyzer_stats_v2 (which now counts
    // status = 'suspended') records it as a loss.
    const entryPrice =
      (trade as any).original_entry_price ||
      (trade as any).entry_price ||
      (trade as any).entry_contract_snapshot?.mid ||
      0;
    const qty = (trade as any).qty || 1;
    const multiplier = (trade as any).contract_multiplier || 100;
    const totalInvestment = entryPrice * qty * multiplier;
    const fullLoss = -Math.abs(totalInvestment);
    const lossOutcome = totalInvestment >= 500 ? 'big_loss' : 'small_loss';

    const updates =
      action === 'suspend'
        ? {
            status: 'suspended',
            suspended_at: now,
            suspended_by: user.id,
            suspension_reason: reason || null,
            suspension_mode: 'manual',
            // Full-loss accounting (reverted on resume)
            is_win: false,
            is_winning_trade: false,
            outcome: 'loss',
            trade_outcome: lossOutcome,
            final_profit: fullLoss,
            pnl_usd: fullLoss,
            profit_from_entry: fullLoss,
            computed_profit_usd: fullLoss,
            counted_in_stats: true,
            updated_at: now,
          }
        : {
            status: 'active',
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
            suspension_mode: null,
            // Clear the full-loss accounting — live tracking recomputes it.
            is_win: false,
            is_winning_trade: false,
            outcome: null,
            trade_outcome: null,
            final_profit: 0,
            pnl_usd: 0,
            profit_from_entry: 0,
            computed_profit_usd: 0,
            counted_in_stats: false,
            updated_at: now,
          };

    const { data: updated, error: updateError } = await supabase
      .from('index_trades')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('[indices/trades/suspend] update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit trail in trade_updates so the change shows in the trade timeline.
    await supabase.from('trade_updates').insert({
      trade_id: id,
      author_id: user.id,
      body: action === 'suspend' ? 'تم وقف متابعة العقد / Contract tracking suspended' : 'تم استئناف متابعة العقد / Contract tracking resumed',
      changes: { status: { old: trade.status, new: updates.status }, reason },
    });

    // Queue a Telegram notice (best-effort — never block the suspension on it).
    const analysis = Array.isArray((trade as any).analysis)
      ? (trade as any).analysis[0]
      : (trade as any).analysis;
    const channelFk = trade.telegram_channel_id ?? analysis?.telegram_channel_id ?? null;
    let telegramQueued = false;

    if (channelFk) {
      const { data: channel } = await supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('id', channelFk)
        .maybeSingle();

      if (channel?.channel_id) {
        const contractLabel = trade.option_type
          ? `${trade.underlying_index_symbol} $${trade.strike} ${String(trade.option_type).toUpperCase()}`
          : `${trade.underlying_index_symbol} ${String(trade.direction || '').toUpperCase()}`;

        const message =
          action === 'suspend'
            ? [
                '⛔️ <b>وقف متابعة العقد | CONTRACT SUSPENDED</b>',
                '',
                `<b>${contractLabel}</b>`,
                trade.polygon_option_ticker ? `<code>${trade.polygon_option_ticker}</code>` : '',
                '',
                'تم إيقاف متابعة هذا العقد ولن يصدر تحديثات بعد الآن.',
                'Tracking for this contract has been stopped — no further updates will be sent.',
                reason ? `\n📝 السبب / Reason: ${reason}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            : [
                '✅ <b>استئناف متابعة العقد | CONTRACT RESUMED</b>',
                '',
                `<b>${contractLabel}</b>`,
                trade.polygon_option_ticker ? `<code>${trade.polygon_option_ticker}</code>` : '',
                '',
                'تمت إعادة تفعيل متابعة هذا العقد.',
                'Tracking for this contract has been re-enabled.',
              ]
                .filter(Boolean)
                .join('\n');

        const { error: outboxError } = await supabase.from('telegram_outbox').insert({
          message_type: action === 'suspend' ? 'trade_suspended' : 'trade_resumed',
          payload: { trade: { ...updated }, message },
          channel_id: channel.channel_id,
          status: 'pending',
          priority: 4,
          next_retry_at: now,
        });

        if (outboxError) {
          console.error('[indices/trades/suspend] outbox insert failed:', outboxError);
        } else {
          telegramQueued = true;
        }
      }
    }

    return NextResponse.json({ trade: updated, action, telegram_queued: telegramQueued });
  } catch (error: any) {
    console.error('[indices/trades/suspend] error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
