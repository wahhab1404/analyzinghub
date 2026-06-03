import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/twitter/disconnect
 * Unlinks the analyst's X account by deleting their twitter_accounts row.
 * RLS restricts the delete to the caller's own row.
 */
export async function POST() {
  const supabase = createClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('twitter_accounts')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    console.error('[twitter/disconnect] delete failed:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
