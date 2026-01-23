import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: tradeStats } = await supabase
      .from('index_trades')
      .select('status, is_win, computed_profit_usd, peak_price_after_entry, contract_high_since, closed_at, entry_contract_snapshot, contract_multiplier, qty')
      .eq('author_id', user.id);

    const totalTrades = tradeStats?.length || 0;
    const activeTrades = tradeStats?.filter(t => t.status === 'active').length || 0;
    const closedTrades = tradeStats?.filter(t => t.status === 'closed').length || 0;
    const winningTrades = tradeStats?.filter(t => t.status === 'closed' && t.is_win === true).length || 0;
    const winRate = closedTrades > 0 ? ((winningTrades / closedTrades) * 100).toFixed(1) : '0';

    const totalProfit = tradeStats?.reduce((sum, t) => {
      if (t.status === 'closed' && t.computed_profit_usd != null) {
        return sum + parseFloat(t.computed_profit_usd.toString());
      }
      if (t.status === 'closed' && t.is_win === false) {
        const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
        const multiplier = t.contract_multiplier || 100;
        const qty = t.qty || 1;
        const entryCost = entryPrice * multiplier * qty;
        return sum - entryCost;
      }
      return sum;
    }, 0) || 0;

    const currentMonthProfit = tradeStats?.reduce((sum, t) => {
      if (t.closed_at) {
        const closedDate = new Date(t.closed_at);
        const now = new Date();
        if (closedDate.getMonth() === now.getMonth() && closedDate.getFullYear() === now.getFullYear()) {
          if (t.computed_profit_usd != null) {
            return sum + parseFloat(t.computed_profit_usd.toString());
          }
          if (t.is_win === false) {
            const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
            const multiplier = t.contract_multiplier || 100;
            const qty = t.qty || 1;
            const entryCost = entryPrice * multiplier * qty;
            return sum - entryCost;
          }
        }
      }
      return sum;
    }, 0) || 0;

    const { data: recentTrades } = await supabase
      .from('index_trades')
      .select(`
        id,
        status,
        instrument_type,
        direction,
        underlying_index_symbol,
        strike,
        expiry,
        option_type,
        computed_profit_usd,
        is_win,
        peak_price_after_entry,
        contract_high_since,
        closed_at,
        created_at,
        entry_contract_snapshot,
        current_contract,
        qty,
        contract_multiplier
      `)
      .eq('author_id', user.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(5);

    const last7DaysData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const dayTrades = tradeStats?.filter(t => {
        if (t.closed_at) {
          const closedDate = new Date(t.closed_at).toISOString().split('T')[0];
          return closedDate === dateStr;
        }
        return false;
      }) || [];

      const dayProfit = dayTrades.reduce((sum, t) => {
        if (t.computed_profit_usd != null) {
          return sum + parseFloat(t.computed_profit_usd.toString());
        }
        if (t.is_win === false) {
          const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
          const multiplier = t.contract_multiplier || 100;
          const qty = t.qty || 1;
          const entryCost = entryPrice * multiplier * qty;
          return sum - entryCost;
        }
        return sum;
      }, 0);

      last7DaysData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        profit: parseFloat(dayProfit.toFixed(2)),
        trades: dayTrades.length,
      });
    }

    return NextResponse.json({
      summary: {
        totalTrades,
        activeTrades,
        closedTrades,
        winningTrades,
        winRate: parseFloat(winRate),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        currentMonthProfit: parseFloat(currentMonthProfit.toFixed(2)),
      },
      recentTrades: recentTrades || [],
      chartData: last7DaysData,
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
