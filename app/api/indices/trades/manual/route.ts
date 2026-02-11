import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
        telegram_send_enabled: false,
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

    return NextResponse.json({
      success: true,
      trade,
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
