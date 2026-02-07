import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Trade {
  id: string;
  expiry: string;
  max_profit: number;
  status: string;
  instrument_type: string;
  direction: string;
  underlying_index_symbol: string;
  strike: number;
  option_type: string;
  entry_contract_snapshot: any;
  current_contract: number;
  qty: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];

    console.log(`[Expired Trades Closer] Running at ${now.toISOString()}`);

    const { data: activeTrades, error: fetchError } = await supabase
      .from('index_trades')
      .select('*')
      .eq('status', 'active')
      .eq('instrument_type', 'options')
      .not('expiry', 'is', null);

    if (fetchError) {
      console.error('[Expired Trades Closer] Error fetching trades:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!activeTrades || activeTrades.length === 0) {
      console.log('[Expired Trades Closer] No active option trades found');
      return new Response(
        JSON.stringify({ message: 'No active trades to process', closedCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiredTrades = activeTrades.filter((trade: Trade) => {
      const expiryDate = new Date(trade.expiry).toISOString().split('T')[0];
      const isExpired = expiryDate < currentDate;

      if (isExpired) {
        console.log(`[Expired] Trade ${trade.id} - Expiry: ${trade.expiry}, Current: ${currentDate}`);
      }

      return isExpired;
    });

    console.log(`[Expired Trades Closer] Found ${expiredTrades.length} expired trades`);

    const closedTrades = [];
    const errors = [];

    for (const trade of expiredTrades) {
      try {
        const maxProfit = parseFloat(trade.max_profit?.toString() || '0');
        const entryPrice = trade.entry_contract_snapshot?.price || trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
        const qty = trade.qty || 1;
        const multiplier = 100;

        let finalProfit: number;
        let tradeOutcome: string;
        let isWinningTrade: boolean;
        let closingPrice: number;

        if (maxProfit >= 100) {
          isWinningTrade = true;
          finalProfit = maxProfit;

          if (maxProfit >= 500) {
            tradeOutcome = 'big_win';
          } else {
            tradeOutcome = 'small_win';
          }

          closingPrice = entryPrice + (maxProfit / (qty * multiplier));
        } else {
          isWinningTrade = false;
          const totalInvestment = entryPrice * qty * multiplier;
          finalProfit = -totalInvestment;
          closingPrice = 0;

          if (totalInvestment >= 500) {
            tradeOutcome = 'big_loss';
          } else {
            tradeOutcome = 'small_loss';
          }
        }

        const { error: updateError } = await supabase
          .from('index_trades')
          .update({
            status: 'closed',
            closed_at: now.toISOString(),
            profit_from_entry: finalProfit,
            pnl_usd: finalProfit,
            final_profit: finalProfit,
            computed_profit_usd: finalProfit,
            current_contract: closingPrice,
            is_winning_trade: isWinningTrade,
            is_win: isWinningTrade,
            trade_outcome: tradeOutcome,
            outcome: isWinningTrade ? 'succeed' : 'loss',
            counted_in_stats: true,
            notes: trade.notes
              ? `${trade.notes}\n\n[AUTO-CLOSED] Expired on ${trade.expiry}. Max profit: $${maxProfit.toFixed(2)}`
              : `[AUTO-CLOSED] Expired on ${trade.expiry}. Max profit: $${maxProfit.toFixed(2)}`
          })
          .eq('id', trade.id);

        if (updateError) {
          console.error(`[Expired Trades Closer] Error closing trade ${trade.id}:`, updateError);
          errors.push({ tradeId: trade.id, error: updateError.message });
        } else {
          console.log(`[Expired Trades Closer] Closed trade ${trade.id}: ${trade.underlying_index_symbol} ${trade.strike}${trade.option_type} - Max Profit: $${maxProfit.toFixed(2)} - Outcome: ${tradeOutcome}`);
          closedTrades.push({
            id: trade.id,
            symbol: trade.underlying_index_symbol,
            strike: trade.strike,
            optionType: trade.option_type,
            expiry: trade.expiry,
            maxProfit: maxProfit,
            finalProfit: finalProfit,
            outcome: tradeOutcome,
            isWin: isWinningTrade
          });

          const { data: channel } = await supabase
            .from('telegram_channels')
            .select('channel_id')
            .eq('id', trade.telegram_channel_id)
            .single();

          if (channel?.channel_id) {
            const profitSign = finalProfit >= 0 ? '+' : '';
            const profitEmoji = finalProfit >= 0 ? '💰' : '📉';

            const message = isWinningTrade
              ? `🎯 *Trade Auto-Closed (Expired)*\n\n${trade.underlying_index_symbol} ${trade.strike}${trade.option_type?.toUpperCase()}\n\n✅ *Max Profit Reached:* $${maxProfit.toFixed(2)}\n💰 *Final P/L:* ${profitSign}$${finalProfit.toFixed(2)}\n📊 *Outcome:* ${tradeOutcome.toUpperCase().replace('_', ' ')}\n\nExpired: ${trade.expiry}`
              : `📊 *Trade Auto-Closed (Expired)*\n\n${trade.underlying_index_symbol} ${trade.strike}${trade.option_type?.toUpperCase()}\n\n❌ *Did not reach $100 target*\n${profitEmoji} *Total Loss:* ${profitSign}$${finalProfit.toFixed(2)}\n📊 *Outcome:* ${tradeOutcome.toUpperCase().replace('_', ' ')}\n\nExpired: ${trade.expiry}`;

            await supabase.from('telegram_outbox').insert({
              message_type: 'trade_closed',
              payload: {
                trade: {
                  ...trade,
                  status: 'closed',
                  profit_from_entry: finalProfit,
                  trade_outcome: tradeOutcome
                },
                message
              },
              channel_id: channel.channel_id,
              status: 'pending',
              priority: 5,
              next_retry_at: now.toISOString(),
            });

            console.log(`[Expired Trades Closer] Queued Telegram notification for trade ${trade.id}`);
          }
        }
      } catch (error) {
        console.error(`[Expired Trades Closer] Error processing trade ${trade.id}:`, error);
        errors.push({ tradeId: trade.id, error: error.message });
      }
    }

    const response = {
      success: true,
      timestamp: now.toISOString(),
      summary: {
        totalActiveChecked: activeTrades.length,
        expiredFound: expiredTrades.length,
        closedSuccessfully: closedTrades.length,
        errors: errors.length
      },
      closedTrades,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log(`[Expired Trades Closer] Completed: ${closedTrades.length} trades closed, ${errors.length} errors`);

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Expired Trades Closer] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});