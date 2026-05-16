import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { polygonService } from '@/services/indices/polygon.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/companies/contract-quote
 * Fetch live bid/ask/mid quote for a specific stock options contract
 *
 * Query params:
 * - ticker: O:AAPL250117C00150000 (required)
 * - symbol: AAPL (required)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const ticker = searchParams.get('ticker')
    const symbol = searchParams.get('symbol')

    if (!ticker || !symbol) {
      return NextResponse.json(
        { error: 'Missing required params: ticker, symbol' },
        { status: 400 }
      )
    }

    const contract = await polygonService.getOptionSnapshot(symbol, ticker)

    return NextResponse.json(
      { quote: contract.quote, success: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error: any) {
    console.error('[Company Contract Quote] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
