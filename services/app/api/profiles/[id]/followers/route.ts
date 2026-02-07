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

    const { data: followers, error } = await supabase
      .rpc('get_followers_list', { analyzer_user_id: profileId })

    if (error) {
      console.error('Error fetching followers:', error)
      return NextResponse.json({ error: 'Failed to fetch followers' }, { status: 500 })
    }

    return NextResponse.json({ followers: followers || [] })
  } catch (error) {
    console.error('Error in followers API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
