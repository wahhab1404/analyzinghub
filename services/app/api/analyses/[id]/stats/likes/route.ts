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

    const { count, error } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('analysis_id', analysisId)

    if (error) {
      console.error('[Likes API] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[Likes API] Count for analysis', analysisId, ':', count || 0)
    return NextResponse.json({ count: count || 0 })
  } catch (error: any) {
    console.error('Get likes count error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get likes count' },
      { status: 500 }
    )
  }
}
