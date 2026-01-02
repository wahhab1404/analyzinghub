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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's comments (including replies)
    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        *,
        profiles!comments_user_id_fkey (
          id,
          full_name,
          avatar_url,
          email
        ),
        analyses (
          id,
          direction,
          analyzer_id,
          profiles!analyses_analyzer_id_fkey (
            id,
            full_name,
            avatar_url,
            email
          ),
          symbols (
            id,
            symbol
          )
        ),
        parent_comment:parent_comment_id (
          id,
          content,
          profiles:user_id (
            id,
            full_name,
            email
          )
        )
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get user replies error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const transformedComments = comments?.map(comment => ({
      ...comment,
      profiles: {
        ...comment.profiles,
        username: comment.profiles.email,
        display_name: comment.profiles.full_name,
      }
    })) || []

    return NextResponse.json({ comments: transformedComments })
  } catch (error: any) {
    console.error('Get user replies error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get user replies' },
      { status: 500 }
    )
  }
}
