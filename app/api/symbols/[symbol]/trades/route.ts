import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

/**
 * Returns public company contract trades for a given symbol.
 * Only trades linked to analyses with visibility = 'public' are returned,
 * preserving analysts' privacy preferences.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params = await context.params
    const { symbol: symbolParam } = params
    const supabase = createRouteHandlerClient(request)
    const symbol = symbolParam.toUpperCase()

    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') // ACTIVE | CLOSED | EXPIRED | null (all)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // First: get public analysis IDs for this symbol
    const { data: publicAnalyses } = await supabase
      .from('analyses')
      .select(`
        id,
        symbols!inner ( symbol )
      `)
      .eq('symbols.symbol', symbol)
      .eq('visibility', 'public')

    const publicAnalysisIds = (publicAnalyses || []).map(a => a.id)

    if (publicAnalysisIds.length === 0) {
      return NextResponse.json({ trades: [] })
    }

    // Then: get contract trades for those analysis IDs
    let query = supabase
      .from('contract_trades')
      .select(`
        id,
        symbol,
        direction,
        strike,
        expiry_date,
        entry_price,
        contracts_qty,
        contract_multiplier,
        entry_cost_total,
        max_price_since_entry,
        max_profit_value,
        pnl_value,
        is_win,
        status,
        close_reason,
        created_at,
        closed_at:close_time,
        analysis_id,
        author_id,
        profiles!contract_trades_author_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('scope', 'company')
      .eq('symbol', symbol)
      .in('analysis_id', publicAnalysisIds)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data: trades, error } = await query

    if (error) {
      console.error('Trades query error:', error)
      return NextResponse.json({ trades: [] })
    }

    return NextResponse.json({ trades: trades || [] })
  } catch (error) {
    console.error('Error in GET /api/symbols/[symbol]/trades:', error)
    return NextResponse.json({ trades: [] })
  }
}
