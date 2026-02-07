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

    const { data: existingLike } = await supabase
      .from('likes')
      .select('id')
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingLike) {
      return NextResponse.json(
        { error: 'Already liked this analysis' },
        { status: 400 }
      )
    }

    const { data: like, error } = await supabase
      .from('likes')
      .insert({
        analysis_id: analysisId,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Create like error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ like }, { status: 201 })
  } catch (error: any) {
    console.error('Create like error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to like analysis' },
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
      .from('likes')
      .delete()
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Delete like error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete like error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to unlike analysis' },
      { status: 500 }
    )
  }
}
