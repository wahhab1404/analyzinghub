import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { announceContractTradeOnTwitter } from '@/lib/twitter/announce'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/companies/contract-trades/[id]/post-to-twitter
 * Announce a winning company contract trade on the analyst's own X account.
 * The analyst must own the trade (author_id/created_by) or be SuperAdmin.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient(cookies())
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('roles(name)').eq('id', user.id).single()
    const isSuperAdmin = (profile as any)?.roles?.name === 'SuperAdmin'

    const { data: trade } = await supabase
      .from('contract_trades').select('id, author_id, created_by').eq('id', id).single()
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    const owner = trade.author_id ?? trade.created_by
    if (owner !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await announceContractTradeOnTwitter(createServiceRoleClient(), id)
    return NextResponse.json(result.body, { status: result.status })
  } catch (err: any) {
    console.error('[POST /api/companies/contract-trades/[id]/post-to-twitter]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
