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

    const { data: existingSave } = await supabase
      .from('saves')
      .select('id')
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingSave) {
      return NextResponse.json(
        { error: 'Already saved this analysis' },
        { status: 400 }
      )
    }

    const { data: save, error } = await supabase
      .from('saves')
      .insert({
        analysis_id: analysisId,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Create save error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ save }, { status: 201 })
  } catch (error: any) {
    console.error('Create save error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save analysis' },
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
      .from('saves')
      .delete()
      .eq('analysis_id', analysisId)
      .eq('user_id', user.id)

    if (error) {
      console.error('Delete save error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete save error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to unsave analysis' },
      { status: 500 }
    )
  }
}
