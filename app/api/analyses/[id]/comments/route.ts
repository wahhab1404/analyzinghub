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

    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Comments API] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[Comments API] Found', comments?.length || 0, 'comments')
    return NextResponse.json({ comments: comments || [] })
  } catch (error: any) {
    console.error('Get comments error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get comments' },
      { status: 500 }
    )
  }
}

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
    const { content, parent_comment_id } = body

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const insertData: any = {
      analysis_id: analysisId,
      user_id: user.id,
      content: content.trim(),
    }

    if (parent_comment_id) {
      insertData.parent_comment_id = parent_comment_id
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert(insertData)
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .single()

    if (error) {
      console.error('Create comment error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error: any) {
    console.error('Create comment error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create comment' },
      { status: 500 }
    )
  }
}
