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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profileId = params.id
    const isOwnProfile = user.id === profileId

    // Check if the viewer has an active subscription to this profile
    let hasSubscription = false
    let subscriptionPlans: string[] = []

    if (!isOwnProfile) {
      const { data: subscription } = await supabase
        .from('analyst_subscribers')
        .select('status, analyzer_plans(plan_id)')
        .eq('subscriber_id', user.id)
        .eq('analyst_id', profileId)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .single()

      if (subscription) {
        hasSubscription = true
        subscriptionPlans = subscription.analyzer_plans?.plan_id ? [subscription.analyzer_plans.plan_id] : []
      }
    }

    // Determine what trades to show based on access level
    let query = supabase
      .from('index_trades')
      .select(`
        id,
        underlying_index_symbol,
        strike,
        option_type,
        direction,
        status,
        expiry,
        created_at,
        closed_at,
        computed_profit_usd,
        is_win,
        peak_price_after_entry,
        entry_contract_snapshot,
        current_contract,
        contract_high_since,
        contract_low_since,
        analysis_id,
        instrument_type,
        qty,
        contract_multiplier
      `)
      .eq('author_id', profileId)
      .order('created_at', { ascending: false })

    // Access control logic:
    // 1. Own profile: show all trades
    // 2. Subscriber: show all trades (or filter by subscription plan if needed)
    // 3. Non-subscriber: show only closed trades
    if (!isOwnProfile && !hasSubscription) {
      query = query.eq('status', 'closed')
    }

    const { data: trades, error: tradesError } = await query.limit(50)

    if (tradesError) {
      console.error('Error fetching trades:', tradesError)
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 })
    }

    // Check if profile has any active trades (to show lock message)
    const { count: activeCount } = await supabase
      .from('index_trades')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profileId)
      .eq('status', 'active')

    // Calculate statistics
    const { data: statsData } = await supabase
      .from('index_trades')
      .select('status, is_win, computed_profit_usd, entry_contract_snapshot, qty, contract_multiplier')
      .eq('author_id', profileId)

    const stats = {
      total_trades: statsData?.length || 0,
      active_trades: statsData?.filter(t => t.status === 'active').length || 0,
      closed_trades: statsData?.filter(t => t.status === 'closed').length || 0,
      winning_trades: statsData?.filter(t => t.is_win === true && t.status === 'closed').length || 0,
      win_rate: 0,
      total_pnl: 0,
      avg_win: 0,
      avg_loss: 0
    }

    const closedTrades = statsData?.filter(t => t.status === 'closed') || []
    if (closedTrades.length > 0) {
      stats.win_rate = Math.round((stats.winning_trades / closedTrades.length) * 100)

      stats.total_pnl = closedTrades.reduce((sum, t) => {
        if (t.computed_profit_usd != null) {
          return sum + parseFloat(t.computed_profit_usd.toString())
        } else if (t.is_win === false) {
          const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0
          const multiplier = t.contract_multiplier || 100
          const qty = t.qty || 1
          const entryCost = entryPrice * multiplier * qty
          return sum - entryCost
        }
        return sum
      }, 0)

      const wins = closedTrades.filter(t => t.is_win === true)
      const losses = closedTrades.filter(t => t.is_win === false)

      stats.avg_win = wins.length > 0
        ? wins.reduce((sum, t) => sum + (parseFloat(t.computed_profit_usd?.toString() || '0')), 0) / wins.length
        : 0

      stats.avg_loss = losses.length > 0
        ? losses.reduce((sum, t) => {
            if (t.computed_profit_usd != null) {
              return sum + parseFloat(t.computed_profit_usd.toString())
            } else {
              const entryPrice = t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0
              const multiplier = t.contract_multiplier || 100
              const qty = t.qty || 1
              const entryCost = entryPrice * multiplier * qty
              return sum - entryCost
            }
          }, 0) / losses.length
        : 0
    }

    return NextResponse.json({
      trades: trades || [],
      stats,
      hasActiveTrades: (activeCount || 0) > 0,
      isOwnProfile,
      hasSubscription
    })
  } catch (error) {
    console.error('Error in profile trades API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
