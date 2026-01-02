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
        symbol,
        direction,
        content,
        created_at,
        likes_count,
        comments_count,
        author:profiles!analyses_author_id_fkey(full_name, email)
      `)

    if (filter === 'recent') {
      query = query.order('created_at', { ascending: false }).limit(50)
    } else if (filter === 'popular') {
      query = query.order('likes_count', { ascending: false }).limit(50)
    } else {
      query = query.order('created_at', { ascending: false }).limit(100)
    }

    const { data: analyses, error } = await query

    if (error) throw error

    return NextResponse.json({ analyses })
  } catch (error) {
    console.error('Admin content error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
