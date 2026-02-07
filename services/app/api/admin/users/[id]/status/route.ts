import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params
    const authSupabase = createServerClient()
    const { is_active } = await request.json()

    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await authSupabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.role as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminSupabase = createServiceRoleClient()
    const { error } = await adminSupabase
      .from('profiles')
      .update({ is_active })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
