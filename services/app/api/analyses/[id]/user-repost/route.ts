import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const { id } = params
    const supabase = createRouteHandlerClient(request)
    const analysisId = id

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ isReposted: false })
    }

    const { data, error } = await supabase
      .from('reposts')
      .select('id')
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Check user repost error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ isReposted: !!data })
  } catch (error: any) {
    console.error('Check user repost error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check repost status' },
      { status: 500 }
    )
  }
}
