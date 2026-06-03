import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/twitter/settings
 * Update the analyst's X preferences. Currently: auto_post (auto-announce
 * winning trades when they close). RLS restricts the update to their own row.
 */
export async function PATCH(req: NextRequest) {
  const supabase = createClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { autoPost } = body as { autoPost?: boolean }

  if (typeof autoPost !== 'boolean') {
    return NextResponse.json({ error: 'autoPost (boolean) is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('twitter_accounts')
    .update({ auto_post: autoPost })
    .eq('user_id', user.id)

  if (error) {
    console.error('[twitter/settings] update failed:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }

  return NextResponse.json({ success: true, autoPost })
}
