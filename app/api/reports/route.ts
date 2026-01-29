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

    console.log('[Reports API] Fetching reports for user:', user.id)

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
    console.log('[Reports API] User role:', roleName, 'isAdmin:', isAdmin)

    let query = supabase
      .from('daily_trade_reports')
      .select(`
        id,
        report_date,
        language_mode,
        status,
        file_url,
        created_at,
        period_type,
        start_date,
        end_date,
        summary
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
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

    if (error) {
      console.error('[Reports API] Query error:', error)
      throw error
    }

    console.log('[Reports API] Found', reports?.length || 0, 'reports out of', count, 'total')

    return NextResponse.json({
      reports: reports || [],
      total: count || 0,
      limit,
      offset
    })
  } catch (error) {
    console.error('[Reports API] Error fetching reports:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
