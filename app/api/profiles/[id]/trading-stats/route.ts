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
      .select('status, is_winning_trade, profit_from_entry, max_profit, final_profit, entry_contract_snapshot, contract_high_since, qty')
      .eq('author_id', profileId)
      .eq('status', 'closed')

    const closedTrades = (tradesData || []).map(trade => {
      const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
      const highestPrice = trade.contract_high_since || entryPrice
      const qty = trade.qty || 1
      const multiplier = 100

      const calculatedMaxProfit = (highestPrice - entryPrice) * qty * multiplier

      return {
        ...trade,
        calculated_max_profit: calculatedMaxProfit
      }
    })

    const winningTrades = closedTrades.filter(t => t.calculated_max_profit >= 100)
    const losingTrades = closedTrades.filter(t => t.calculated_max_profit < 100)

    const stats = {
      total_closed_trades: closedTrades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: closedTrades.length > 0
        ? Math.round((winningTrades.length / closedTrades.length) * 100)
        : 0,
      total_profit: closedTrades.reduce((sum, t) => sum + t.calculated_max_profit, 0),
      avg_win: winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.calculated_max_profit, 0) / winningTrades.length
        : 0,
      avg_loss: losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + t.calculated_max_profit, 0) / losingTrades.length
        : 0,
      max_profit: closedTrades.length > 0
        ? Math.max(...closedTrades.map(t => t.calculated_max_profit))
        : 0,
      max_loss: closedTrades.length > 0
        ? Math.min(...closedTrades.map(t => t.calculated_max_profit))
        : 0
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching trading stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
