import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// POST /api/trades/[id]/link-analysis
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

    const { analysis_id } = z.object({ analysis_id: z.string().uuid() }).parse(await req.json())

    const { data: trade } = await supabase.from('trades').select('id, user_id').eq('id', id).single()
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (roleName !== 'SuperAdmin' && trade.user_id !== user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: analysis } = await supabase
      .from('analyses').select('id, analyzer_id').eq('id', analysis_id).single()
    if (!analysis) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    if (roleName !== 'SuperAdmin' && analysis.analyzer_id !== user.id)
      return NextResponse.json({ error: 'Cannot link to another analyst\'s analysis' }, { status: 403 })

    const { data: updated, error } = await supabase
      .from('trades').update({ analysis_id }).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ trade: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/trades/[id]/link-analysis
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('roles(name)').eq('id', user.id).single()
    const roleName = (profile as any)?.roles?.name as string | undefined

    const { data: trade } = await supabase.from('trades').select('id, user_id').eq('id', id).single()
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (roleName !== 'SuperAdmin' && trade.user_id !== user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: updated, error } = await supabase
      .from('trades').update({ analysis_id: null }).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ trade: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
