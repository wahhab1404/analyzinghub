import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { polygonService } from '@/services/indices/polygon.service';
import { tradeOutcomeService } from '@/services/indices/trade-outcome.service';
import { CreateTradeRequest } from '@/services/indices/types';

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

    const body = await request.json();
    const { action, existingTradeId, newTradeData } = body;

    if (!action || !existingTradeId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, existingTradeId' },
        { status: 400 }
      );
    }

    if (action !== 'NEW_TRADE' && action !== 'AVERAGE_ENTRY') {
      return NextResponse.json(
        { error: 'Invalid action. Must be NEW_TRADE or AVERAGE_ENTRY' },
        { status: 400 }
      );
    }

    const { data: existingTrade } = await supabase
      .from('index_trades')
      .select('*')
      .eq('id', existingTradeId)
      .eq('author_id', user.id)
      .single();

    if (!existingTrade) {
      return NextResponse.json(
        { error: 'Existing trade not found or unauthorized' },
        { status: 404 }
      );
    }

    if (action === 'NEW_TRADE') {
      await tradeOutcomeService.closeTradeAtPeak(
        existingTradeId,
        'replaced_by_new_entry'
      );

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

        let actualChannelId = existingTrade.telegram_channel_id;
        if (actualChannelId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualChannelId)) {
          const { data: channel } = await supabaseClient
            .from("telegram_channels")
            .select("channel_id")
            .eq("id", actualChannelId)
            .single();

          if (channel?.channel_id) {
            actualChannelId = channel.channel_id;
          }
        }

        if (actualChannelId) {
          await supabaseClient.from("telegram_outbox").insert({
            message_type: "trade_closed_for_new_entry",
            payload: {
              trade: existingTrade,
              reason: 'Closed at peak to enter new trade at same strike',
              peakPrice: existingTrade.peak_price_after_entry || existingTrade.contract_high_since,
            },
            channel_id: actualChannelId,
            status: "pending",
            priority: 5,
            next_retry_at: new Date().toISOString(),
          });

          console.log(`✅ Queued trade_closed_for_new_entry message for channel ${actualChannelId}`);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'NEW_TRADE',
        message: 'Previous trade closed at peak. You can now create the new trade.',
        closedTrade: existingTrade,
      });
    }

    if (action === 'AVERAGE_ENTRY') {
      if (!newTradeData || !newTradeData.entry_price) {
        return NextResponse.json(
          { error: 'Missing newTradeData.entry_price for averaging' },
          { status: 400 }
        );
      }

      await tradeOutcomeService.averageTradeEntry({
        tradeId: existingTradeId,
        newEntryPrice: newTradeData.entry_price,
        newEntryAmount: newTradeData.entry_amount || 0,
        notes: newTradeData.notes || 'Additional entry point added',
      });

      const { data: updatedTrade } = await supabase
        .from('index_trades')
        .select('*')
        .eq('id', existingTradeId)
        .single();

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

        let actualChannelId = existingTrade.telegram_channel_id;
        if (actualChannelId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualChannelId)) {
          const { data: channel } = await supabaseClient
            .from("telegram_channels")
            .select("channel_id")
            .eq("id", actualChannelId)
            .single();

          if (channel?.channel_id) {
            actualChannelId = channel.channel_id;
          }
        }

        if (actualChannelId) {
          const avgPrice = updatedTrade?.entry_contract_snapshot?.mark || 0;
          const oldPrice = updatedTrade?.entry_contract_snapshot?.originalMark || existingTrade.entry_contract_snapshot?.mark || 0;

          await supabaseClient.from("telegram_outbox").insert({
            message_type: "trade_entry_averaged",
            payload: {
              trade: updatedTrade,
              oldEntryPrice: oldPrice,
              newEntryPrice: newTradeData.entry_price,
              averagedEntryPrice: avgPrice,
              totalEntries: updatedTrade?.entries_data?.length || 2,
            },
            channel_id: actualChannelId,
            status: "pending",
            priority: 5,
            next_retry_at: new Date().toISOString(),
          });

          console.log(`✅ Queued trade_entry_averaged message for channel ${actualChannelId}`);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'AVERAGE_ENTRY',
        message: 'Trade entry has been averaged with new entry price',
        updatedTrade,
      });
    }

    return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
  } catch (error: any) {
    console.error('Error in POST /api/indices/trades/resolve-same-strike:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
