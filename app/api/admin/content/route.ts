import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'all'

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

    let query = supabase
      .from('analyses')
      .select(`
        id,
        symbol_id,
        direction,
        content,
        created_at,
        analyzer:profiles!analyses_analyzer_id_fkey(id, full_name, email),
        symbol:symbols!analyses_symbol_id_fkey(symbol)
      `)

    if (filter === 'recent') {
      query = query.order('created_at', { ascending: false }).limit(50)
    } else {
      query = query.order('created_at', { ascending: false }).limit(100)
    }

    const { data: analyses, error } = await query

    if (error) throw error

    const analysesWithCounts = await Promise.all(
      (analyses || []).map(async (analysis) => {
        const { count: likesCount } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('analysis_id', analysis.id)

        const { count: commentsCount } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('analysis_id', analysis.id)

        return {
          ...analysis,
          likes_count: likesCount || 0,
          comments_count: commentsCount || 0,
        }
      })
    )

    return NextResponse.json({ analyses: analysesWithCounts })
  } catch (error) {
    console.error('Admin content error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
