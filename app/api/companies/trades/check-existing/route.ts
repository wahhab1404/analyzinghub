import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol    = searchParams.get('symbol')
    const strike    = searchParams.get('strike')
    const expiry    = searchParams.get('expiry')
    const direction = searchParams.get('direction')

    if (!symbol || !strike || !expiry || !direction) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // Look for an active option trade matching symbol + direction in trades table,
    // then join option_trade_details to match strike + expiry
    const { data: rows, error } = await supabase
      .from('trades')
      .select('*, option_trade_details(*)')
      .eq('user_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .eq('direction', direction.toLowerCase())
      .eq('trade_type', 'option')
      .in('status', ['active', 'published'])

    if (error) throw error

    // Filter by strike + expiry from option_trade_details
    const strikeNum = parseFloat(strike)
    const match = (rows ?? []).find((t: any) => {
      const od = Array.isArray(t.option_trade_details)
        ? t.option_trade_details[0]
        : t.option_trade_details
      return od?.strike_price === strikeNum && od?.expiration_date === expiry
    })

    return NextResponse.json({ existing_trade: match ?? null })
  } catch (error) {
    console.error('Error checking existing trade:', error)
    return NextResponse.json(
      { error: 'Failed to check existing trade' },
      { status: 500 }
    )
  }
}
