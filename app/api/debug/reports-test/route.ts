import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    // Step 1: Get user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[Debug] Step 1 - Auth:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message
    })

    if (authError || !user) {
      return NextResponse.json({
        step: 'auth',
        error: 'No authenticated user',
        authError: authError?.message
      }, { status: 401 })
    }

    // Step 2: Get profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role:roles(name)')
      .eq('id', user.id)
      .single()

    console.log('[Debug] Step 2 - Profile:', {
      hasProfile: !!profile,
      role: (profile as any)?.role?.name,
      profileError: profileError?.message
    })

    // Step 3: Query reports (simple)
    const { data: reportsSimple, error: errorSimple } = await supabase
      .from('daily_trade_reports')
      .select('id, report_date, status, author_id')
      .eq('author_id', user.id)
      .limit(5)

    console.log('[Debug] Step 3 - Simple Query:', {
      count: reportsSimple?.length || 0,
      errorSimple: errorSimple?.message,
      reports: reportsSimple
    })

    // Step 4: Query reports (full)
    const { data: reportsFull, error: errorFull, count } = await supabase
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
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    console.log('[Debug] Step 4 - Full Query:', {
      count: count,
      actualLength: reportsFull?.length || 0,
      errorFull: errorFull?.message
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email
      },
      profile: {
        role: (profile as any)?.role?.name
      },
      simpleQuery: {
        count: reportsSimple?.length || 0,
        error: errorSimple?.message,
        reports: reportsSimple
      },
      fullQuery: {
        count: count,
        actualLength: reportsFull?.length || 0,
        error: errorFull?.message,
        reports: reportsFull
      }
    })
  } catch (error: any) {
    console.error('[Debug] Exception:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', stack: error.stack },
      { status: 500 }
    )
  }
}
