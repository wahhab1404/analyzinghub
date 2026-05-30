import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    const allowed = ['status', 'close_reason', 'targets', 'stoploss', 'notes', 'contracts_qty']
    for (const field of allowed) {
      if (field in body) updates[field] = body[field]
    }

    if (body.status && body.status !== 'ACTIVE') {
      updates.close_time = new Date().toISOString()
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .update(updates)
      .eq('id', params.id)
      .eq('author_id', user.id)
      .eq('scope', 'company')
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ trade })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('contract_trades')
      .delete()
      .eq('id', params.id)
      .eq('author_id', user.id)
      .eq('scope', 'company')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
