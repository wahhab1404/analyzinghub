/**
 * POST /api/companies/contract-trades/[id]/generate-image
 *
 * Generates a shareable PNG alert card for a company option-contract deal
 * (same satori + @resvg/resvg-wasm approach as index trades), uploads it to the
 * public `trade-images` bucket and persists the URL on the trade row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateAndUploadContractTradeImage } from '@/lib/companies/contract-trade-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userClient = createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: trade, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (trade.author_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const imageUrl = await generateAndUploadContractTradeImage(supabase, params.id, trade)
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
    }

    await supabase
      .from('contract_trades')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ image_url: imageUrl })
  } catch (error) {
    console.error('[contract-image] error:', error)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
