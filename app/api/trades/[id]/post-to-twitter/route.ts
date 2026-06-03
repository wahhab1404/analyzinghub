import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { announceTradeOnTwitter } from '@/lib/twitter/announce'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/trades/[id]/post-to-twitter
 * Announce a winning trade on the analyst's own X account (image + Arabic text).
 * The analyst must own the trade (or be SuperAdmin). Posting logic lives in the
 * shared announce core, which also enforces the profit gate and dedup.
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

    // Ownership check before posting.
    const { data: trade } = await supabase
      .from('trades').select('id, user_id').eq('id', id).single()
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (trade.user_id !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await announceTradeOnTwitter(createServiceRoleClient(), id)
    return NextResponse.json(result.body, { status: result.status })
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/post-to-twitter]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
