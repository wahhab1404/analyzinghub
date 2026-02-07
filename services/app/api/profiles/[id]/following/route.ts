import { createRouteHandlerClient } from '@/lib/api-helpers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const supabase = createRouteHandlerClient(request)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profileId = params.id

    const { data: following, error } = await supabase
      .rpc('get_following_list', { user_id: profileId })

    if (error) {
      console.error('Error fetching following:', error)
      return NextResponse.json({ error: 'Failed to fetch following' }, { status: 500 })
    }

    return NextResponse.json({ following: following || [] })
  } catch (error) {
    console.error('Error in following API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
