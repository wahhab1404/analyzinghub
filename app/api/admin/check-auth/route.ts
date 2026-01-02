import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ isAuthenticated: false, isSuperAdmin: false }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    const isSuperAdmin = profile && (profile.role as any)?.name === 'SuperAdmin'

    return NextResponse.json({
      isAuthenticated: true,
      isSuperAdmin,
      user,
      profile
    })
  } catch (error) {
    console.error('Admin auth check error:', error)
    return NextResponse.json({ isAuthenticated: false, isSuperAdmin: false }, { status: 500 })
  }
}
