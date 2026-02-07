import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { RoleName } from '@/lib/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(`
        *,
        role:roles(*)
      `)
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const { data: stats } = await supabase
      .rpc('get_analyzer_stats', { analyzer_user_id: user.id })
      .maybeSingle()

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email!,
          profile,
          role: profile.role.name as RoleName,
          tutorial_completed: profile.tutorial_completed || false,
          feed_tab_preference: profile.feed_tab_preference || 'recommended',
          stats: stats || {
            total_analyses: 0,
            active_analyses: 0,
            completed_analyses: 0,
            successful_analyses: 0,
            success_rate: 0,
            followers_count: 0,
            following_count: 0
          }
        },
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('ME_ROUTE_ERROR:', err)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
