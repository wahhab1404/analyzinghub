import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.role as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [
      { count: totalUsers },
      { count: totalAnalyses },
      { count: totalAnalyzers },
      { count: activeUsers },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('analyses').select('*', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('*, role:roles!inner(name)', { count: 'exact', head: true })
        .eq('role.name', 'Analyzer'),
      supabase
        .from('engagement_events')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      totalAnalyses: totalAnalyses || 0,
      totalAnalyzers: totalAnalyzers || 0,
      activeUsers: activeUsers || 0,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
