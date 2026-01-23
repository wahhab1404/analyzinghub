import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const supabase = createRouteHandlerClient(request)

    const profileId = params.id

    // Get all closed trades for statistics (publicly visible)
    const { data: tradesData } = await supabase
      .from('index_trades')
      .select('status, is_win, computed_profit_usd, entry_contract_snapshot, qty, contract_multiplier')
      .eq('author_id', profileId)
      .eq('status', 'closed')

    const closedTrades = tradesData || []
    const winningTrades = closedTrades.filter(t => t.is_win === true)
    const losingTrades = closedTrades.filter(t => t.is_win === false)

    const calculateTradeProfit = (trade: any) => {
      if (trade.computed_profit_usd != null) {
        return parseFloat(trade.computed_profit_usd.toString())
      } else if (trade.is_win === false) {
        const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
        const multiplier = trade.contract_multiplier || 100
        const qty = trade.qty || 1
        return -(entryPrice * multiplier * qty)
      }
      return 0
    }

    const tradeProfits = closedTrades.map(calculateTradeProfit)
    const winProfits = winningTrades.map(calculateTradeProfit)
    const lossProfits = losingTrades.map(calculateTradeProfit)

    const stats = {
      total_closed_trades: closedTrades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: closedTrades.length > 0
        ? Math.round((winningTrades.length / closedTrades.length) * 100)
        : 0,
      total_profit: tradeProfits.reduce((sum, p) => sum + p, 0),
      avg_win: winProfits.length > 0
        ? winProfits.reduce((sum, p) => sum + p, 0) / winProfits.length
        : 0,
      avg_loss: lossProfits.length > 0
        ? lossProfits.reduce((sum, p) => sum + p, 0) / lossProfits.length
        : 0,
      max_profit: tradeProfits.length > 0
        ? Math.max(...tradeProfits)
        : 0,
      max_loss: tradeProfits.length > 0
        ? Math.min(...tradeProfits)
        : 0
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching trading stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
