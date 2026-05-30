import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/companies/contract-trades
 * List the authenticated user's company option-contract deals (standalone +
 * analysis-linked) from the unified `contract_trades` table.
 */
export async function GET() {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: trades, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('author_id', user.id)
      .eq('scope', 'company')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[contract-trades] list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trades: trades || [] })
  } catch (error) {
    console.error('[contract-trades] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/companies/contract-trades
 * Create a standalone company option-contract deal (no analysis required).
 * Persists the Polygon option ticker so the Fly.io tracker + cron can follow
 * the price and high-watermark peak live.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      symbol,
      direction,
      strike,
      expiry_date,
      polygon_option_ticker,
      entry_price,
      contracts_qty,
      targets,
      stoploss,
      notes,
      underlying_price,
    } = body

    if (!symbol || !direction || strike == null || !expiry_date || !entry_price) {
      return NextResponse.json(
        { error: 'Missing required fields: symbol, direction, strike, expiry_date, entry_price' },
        { status: 400 }
      )
    }

    const normalizedDirection = String(direction).toUpperCase()
    if (!['CALL', 'PUT'].includes(normalizedDirection)) {
      return NextResponse.json({ error: 'direction must be CALL or PUT' }, { status: 400 })
    }

    const entry = Number(entry_price)
    if (!Number.isFinite(entry) || entry <= 0) {
      return NextResponse.json({ error: 'Invalid entry_price' }, { status: 400 })
    }

    const insertData = {
      scope: 'company' as const,
      analysis_id: null,
      author_id: user.id,
      created_by: user.id,
      symbol: String(symbol).toUpperCase(),
      direction: normalizedDirection,
      strike: Number(strike),
      expiry_date,
      polygon_option_ticker: polygon_option_ticker || null,
      entry_price: entry,
      contracts_qty: contracts_qty ? Number(contracts_qty) : 1,
      contract_multiplier: 100,
      status: 'ACTIVE' as const,
      current_price: entry,
      max_price_since_entry: entry,
      underlying_price: underlying_price != null ? Number(underlying_price) : null,
      last_price_update_at: new Date().toISOString(),
      targets: targets || [],
      stoploss: stoploss || null,
      notes: notes || null,
      idempotency_key: `${user.id}_${polygon_option_ticker || `${symbol}_${strike}_${expiry_date}`}_${Date.now()}`,
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .insert([insertData])
      .select()
      .single()

    if (error) {
      // Unique active-contract index → friendly conflict
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'You already have an active deal for this exact contract' },
          { status: 409 }
        )
      }
      console.error('[contract-trades] create error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trade }, { status: 201 })
  } catch (error) {
    console.error('[contract-trades] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
