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
        image_url,
        created_at,
        period_type,
        start_date,
        end_date,
        summary
      `)
      .order('created_at', { ascending: false })
      .limit(300)

    if (!isAdmin) {
      query = query.eq('author_id', user.id)
    }

    if (dateFilter) {
      query = query.eq('report_date', dateFilter)
    }

    if (languageFilter) {
      query = query.eq('language_mode', languageFilter)
    }

    const { data: allRows, error } = await query

    if (error) {
      console.error('[Reports API] Query error:', error)
      throw error
    }

    // Collapse language/channel variants of the same period into the most
    // recent one, so re-generating a report (e.g. in another language) does
    // not show up as a duplicate row in the history list.
    const seen = new Set<string>()
    const deduped = (allRows || []).filter((r: any) => {
      const key = `${r.period_type}|${r.report_date}|${r.start_date ?? ''}|${r.end_date ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const total = deduped.length
    const reports = deduped.slice(offset, offset + limit)

    console.log('[Reports API] Found', reports.length, 'reports out of', total, 'unique periods')

    return NextResponse.json({
      reports,
      total,
      limit,
      offset
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('[Reports API] Error fetching reports:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
