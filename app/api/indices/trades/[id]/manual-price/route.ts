import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getMarketStatus } from '@/lib/market-hours';

export async function POST(
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

    const { data: existing, error: fetchError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses!analysis_id(id, title, telegram_channel_id)
      `)
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

    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: 'Can only update prices for active trades' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { manualPrice, manualHigh, manualLow } = body;

    const marketStatus = getMarketStatus();

    const updates: any = {
      updated_at: new Date().toISOString(),
      last_quote_at: new Date().toISOString(),
    };
    const changes: Record<string, { old: any; new: any }> = {};

    const entrySnapshot = existing.entry_contract_snapshot || {};
    const entryPrice = entrySnapshot.mid || entrySnapshot.last || 0;

    let newContractPrice = existing.current_contract;
    let isNewHigh = false;
    let sendNewHighNotification = false;
    let newlyWon = false;

    if (manualPrice !== undefined) {
      if (typeof manualPrice !== 'number' || manualPrice <= 0) {
        return NextResponse.json(
          { error: 'Manual price must be a positive number' },
          { status: 400 }
        );
      }

      newContractPrice = manualPrice;
      updates.manual_contract_price = manualPrice;
      updates.current_contract = manualPrice;
      updates.is_using_manual_price = true;
      changes.manual_contract_price = { old: existing.current_contract, new: manualPrice };

      const { data: highUpdateResult, error: highUpdateError } = await supabase.rpc(
        'update_trade_high_watermark',
        {
          p_trade_id: id,
          p_current_price: manualPrice,
        }
      );

      if (highUpdateError) {
        console.error('Error calling update_trade_high_watermark:', highUpdateError);
      } else if (highUpdateResult) {
        console.log('High watermark update result:', highUpdateResult);
        isNewHigh = highUpdateResult.is_new_high || false;
        newlyWon = highUpdateResult.newly_won || false;
        sendNewHighNotification = isNewHigh || newlyWon;

        if (highUpdateResult.new_high) {
          updates.contract_high_since = highUpdateResult.new_high;
          updates.max_contract_price = highUpdateResult.new_high;
        }
      }
    }

    if (manualHigh !== undefined) {
      if (typeof manualHigh !== 'number' || manualHigh <= 0) {
        return NextResponse.json(
          { error: 'Manual high must be a positive number' },
          { status: 400 }
        );
      }

      const { data: highUpdateResult, error: highUpdateError } = await supabase.rpc(
        'update_trade_high_watermark',
        {
          p_trade_id: id,
          p_current_price: manualHigh,
        }
      );

      if (highUpdateError) {
        console.error('Error calling update_trade_high_watermark:', highUpdateError);
      } else if (highUpdateResult) {
        console.log('Manual high update result:', highUpdateResult);

        if (highUpdateResult.is_new_high) {
          updates.manual_contract_high = manualHigh;
          updates.contract_high_since = highUpdateResult.new_high;
          updates.max_contract_price = highUpdateResult.new_high;
          changes.manual_contract_high = { old: existing.contract_high_since, new: highUpdateResult.new_high };
          isNewHigh = true;
          newlyWon = highUpdateResult.newly_won || false;
          sendNewHighNotification = true;
        } else {
          console.log(`⚠️ Ignoring manual high ${manualHigh} - current high is already higher`);
        }
      }
    }

    if (manualLow !== undefined) {
      if (typeof manualLow !== 'number' || manualLow <= 0) {
        return NextResponse.json(
          { error: 'Manual low must be a positive number' },
          { status: 400 }
        );
      }

      const currentLow = existing.contract_low_since || Infinity;
      if (manualLow < currentLow || currentLow === Infinity) {
        updates.manual_contract_low = manualLow;
        updates.contract_low_since = manualLow;
        changes.manual_contract_low = { old: existing.contract_low_since, new: manualLow };
      } else {
        console.log(`⚠️ Ignoring manual low ${manualLow} - current low ${currentLow} is already lower`);
      }
    }

    if (entryPrice > 0) {
      const highPrice = updates.contract_high_since || existing.contract_high_since || entryPrice;
      const currentPrice = updates.current_contract || existing.current_contract || entryPrice;

      updates.max_profit = (highPrice - entryPrice) * (existing.qty || 1);
      updates.profit_from_entry = ((currentPrice - entryPrice) / entryPrice) * 100;
    }

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
      console.error('Error updating manual prices:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (Object.keys(changes).length > 0) {
      await supabase
        .from('index_trade_updates')
        .insert({
          trade_id: id,
          update_type: 'manual_price',
          title: 'Manual Price Update',
          body: `Manual price update: ${marketStatus.isOpen ? 'During RTH' : 'Outside RTH'}`,
          changes,
        });
    }

    if (sendNewHighNotification && trade) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        const newHigh = updates.contract_high_since;
        const gainPercent = entryPrice > 0 ? ((newHigh - entryPrice) / entryPrice) * 100 : 0;

        console.log(`📸 Generating snapshot for new high: $${newHigh} (+${gainPercent.toFixed(2)}%)`);

        const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            tradeId: id,
            isNewHigh: true,
            newHighPrice: newHigh,
          }),
        });

        let snapshotUrl = null;
        if (snapshotResponse.ok) {
          const snapshotResult = await snapshotResponse.json();
          snapshotUrl = snapshotResult.imageUrl;
          console.log(`✅ Snapshot generated: ${snapshotUrl}`);

          await supabase
            .from('index_trades')
            .update({ contract_url: snapshotUrl })
            .eq('id', id);

          trade.contract_url = snapshotUrl;
        }

        const channelId = existing.telegram_channel_id || existing.analysis?.telegram_channel_id;
        if (channelId && existing.telegram_send_enabled !== false) {
          const { data: channel } = await supabase
            .from('telegram_channels')
            .select('channel_id')
            .eq('id', channelId)
            .single();

          const actualChannelId = channel?.channel_id || channelId;

          await supabase.from('telegram_outbox').insert({
            message_type: newlyWon ? 'milestone' : 'new_high',
            payload: {
              tradeId: id,
              highPrice: newHigh,
              gainPercent,
              snapshotUrl,
              isWinningTrade: newlyWon,
              milestoneType: newlyWon ? '$100_profit' : undefined,
              trade: { ...existing, ...updates, contract_url: snapshotUrl },
            },
            channel_id: actualChannelId,
            status: 'pending',
            priority: newlyWon ? 10 : 5,
            next_retry_at: new Date().toISOString(),
          });

          console.log(`📤 Queued new high notification to channel ${actualChannelId}`);
        }
      } catch (notifError) {
        console.error('Error sending new high notification:', notifError);
      }
    }

    return NextResponse.json({
      trade,
      message: 'Manual prices updated successfully',
      marketStatus: marketStatus.status,
      newHighDetected: sendNewHighNotification,
      isWinningTrade: newlyWon
    });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades/[id]/manual-price:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
