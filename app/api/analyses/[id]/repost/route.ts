import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const dynamic = 'force-dynamic'

export async function POST(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { comment } = body

    const { data: existingRepost } = await supabase
      .from('reposts')
      .select('id')
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingRepost) {
      return NextResponse.json(
        { error: 'Already reposted this analysis' },
        { status: 400 }
      )
    }

    const { data: repost, error } = await supabase
      .from('reposts')
      .insert({
        analysis_id: analysisId,
        user_id: user.id,
        comment: comment || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Create repost error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ repost }, { status: 201 })
  } catch (error: any) {
    console.error('Create repost error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to repost analysis' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('reposts')
      .delete()
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Delete repost error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete repost error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to unrepost analysis' },
      { status: 500 }
    )
  }
}
