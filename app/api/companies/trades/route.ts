import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { calculateCanonicalPnL, calculateAverageEntry } from '@/services/trades/canonical-pnl.service'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const analysisId = searchParams.get('analysis_id')
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status')

    let query = supabase
      .from('contract_trades')
      .select('*')
      .eq('scope', 'company')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })

    if (analysisId) {
      query = query.eq('analysis_id', analysisId)
    }

    if (symbol) {
      query = query.eq('symbol', symbol)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data: trades, error } = await query

    if (error) throw error

    return NextResponse.json({ trades })
  } catch (error) {
    console.error('Error fetching company trades:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trades' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      scope,
      analysis_id,
      symbol,
      direction,
      strike,
      expiry_date,
      entry_price,
      contracts_qty,
      targets,
      stoploss,
      notes,
      is_average_entry,
      existing_trade_id
    } = body

    if (!analysis_id || !symbol || !direction || !strike || !expiry_date || !entry_price) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (is_average_entry && existing_trade_id) {
      const { data: existingTrade, error: fetchError } = await supabase
        .from('contract_trades')
        .select('*')
        .eq('id', existing_trade_id)
        .single()

      if (fetchError || !existingTrade) {
        return NextResponse.json(
          { error: 'Existing trade not found' },
          { status: 404 }
        )
      }

      const averaged = calculateAverageEntry(
        { price: existingTrade.entry_price, qty: existingTrade.contracts_qty },
        { price: entry_price, qty: contracts_qty }
      )

      const adjustmentHistory = existingTrade.adjustment_history || []
      adjustmentHistory.push({
        timestamp: new Date().toISOString(),
        old_entry: existingTrade.entry_price,
        old_qty: existingTrade.contracts_qty,
        new_entry: entry_price,
        new_qty: contracts_qty,
        averaged_entry: averaged.averagePrice,
        total_qty: averaged.totalQty
      })

      const { data: updatedTrade, error: updateError } = await supabase
        .from('contract_trades')
        .update({
          entry_price: averaged.averagePrice,
          contracts_qty: averaged.totalQty,
          avg_adjustments_count: (existingTrade.avg_adjustments_count || 0) + 1,
          adjustment_history: adjustmentHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing_trade_id)
        .select()
        .single()

      if (updateError) throw updateError

      return NextResponse.json({ trade: updatedTrade, averaged: true })
    }

    const tradeData = {
      scope: 'company',
      analysis_id,
      author_id: user.id,
      created_by: user.id,
      symbol: symbol.toUpperCase(),
      direction: direction.toUpperCase(),
      strike,
      expiry_date,
      entry_price,
      contracts_qty: contracts_qty || 1,
      contract_multiplier: 100,
      status: 'ACTIVE',
      max_price_since_entry: entry_price,
      targets: targets || [],
      stoploss,
      notes,
      is_testing: false,
      testing_channel_ids: []
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .insert([tradeData])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error) {
    console.error('Error creating company trade:', error)
    return NextResponse.json(
      { error: 'Failed to create trade' },
      { status: 500 }
    )
  }
}
