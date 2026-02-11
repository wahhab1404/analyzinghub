import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const strike = searchParams.get('strike')
    const expiry = searchParams.get('expiry')
    const direction = searchParams.get('direction')

    if (!symbol || !strike || !expiry || !direction) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const { data: existingTrade, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('scope', 'company')
      .eq('author_id', user.id)
      .eq('symbol', symbol.toUpperCase())
      .eq('strike', parseFloat(strike))
      .eq('expiry_date', expiry)
      .eq('direction', direction.toUpperCase())
      .eq('status', 'ACTIVE')
      .maybeSingle()

    if (error) throw error

    return NextResponse.json({ existing_trade: existingTrade })
  } catch (error) {
    console.error('Error checking existing trade:', error)
    return NextResponse.json(
      { error: 'Failed to check existing trade' },
      { status: 500 }
    )
  }
}
