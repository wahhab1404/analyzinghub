import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// POST /api/trades/[id]/assign-plan  — assign a plan to a trade
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('roles(name)').eq('id', user.id).single()
    const roleName = (profile as any)?.roles?.name as string | undefined

    const { plan_id } = z.object({ plan_id: z.string().uuid().nullable() }).parse(await req.json())

    const { data: trade } = await supabase.from('trades').select('id, user_id').eq('id', id).single()
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (roleName !== 'SuperAdmin' && trade.user_id !== user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (plan_id) {
      const { data: plan } = await supabase.from('analyzer_plans').select('id, analyst_id').eq('id', plan_id).single()
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
      if (roleName !== 'SuperAdmin' && plan.analyst_id !== user.id)
        return NextResponse.json({ error: 'Cannot assign another analyst\'s plan' }, { status: 403 })
    }

    const { data: updated, error } = await supabase
      .from('trades').update({ plan_id: plan_id ?? null }).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ trade: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/trades/[id]/assign-plan  — remove plan from trade
export async function DELETE(req: NextRequest, { params }: Params) {
  return POST(
    new NextRequest(req.url, {
      method: 'POST',
      body: JSON.stringify({ plan_id: null }),
      headers: req.headers,
    }),
    { params }
  )
}
