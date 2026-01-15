import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const dateFilter = url.searchParams.get('date')
    const languageFilter = url.searchParams.get('language')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .single()

    const roleName = (profile as any)?.role?.name
    const isAdmin = roleName === 'SuperAdmin'

    let query = supabase
      .from('daily_trade_reports')
      .select(`
        *,
        deliveries:report_deliveries(*)
      `, { count: 'exact' })
      .order('report_date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (!isAdmin) {
      query = query.eq('author_id', user.id)
    }

    if (dateFilter) {
      query = query.eq('report_date', dateFilter)
    }

    if (languageFilter) {
      query = query.eq('language_mode', languageFilter)
    }

    const { data: reports, error, count } = await query

    if (error) throw error

    return NextResponse.json({
      reports,
      total: count,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
