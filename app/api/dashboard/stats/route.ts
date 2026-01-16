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
      .select('status, is_winning_trade, profit_from_entry, max_profit, final_profit, closed_at, trade_outcome')
      .eq('author_id', user.id);

    const totalTrades = tradeStats?.length || 0;
    const activeTrades = tradeStats?.filter(t => t.status === 'active').length || 0;
    const closedTrades = tradeStats?.filter(t => t.status === 'closed').length || 0;
    const winningTrades = tradeStats?.filter(t => t.is_winning_trade).length || 0;
    const winRate = closedTrades > 0 ? ((winningTrades / closedTrades) * 100).toFixed(1) : '0';

    const totalProfit = tradeStats?.reduce((sum, t) => {
      if (t.status === 'closed') {
        const profit = t.max_profit ?? t.profit_from_entry ?? 0;
        return sum + parseFloat(profit.toString());
      }
      return sum;
    }, 0) || 0;

    const currentMonthProfit = tradeStats?.reduce((sum, t) => {
      if (t.closed_at) {
        const closedDate = new Date(t.closed_at);
        const now = new Date();
        if (closedDate.getMonth() === now.getMonth() && closedDate.getFullYear() === now.getFullYear()) {
          const profit = t.max_profit ?? t.profit_from_entry ?? 0;
          return sum + parseFloat(profit.toString());
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
        profit_from_entry,
        max_profit,
        final_profit,
        is_winning_trade,
        trade_outcome,
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
        const profit = t.max_profit ?? t.profit_from_entry ?? 0;
        return sum + parseFloat(profit.toString());
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
