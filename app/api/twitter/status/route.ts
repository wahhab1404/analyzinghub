import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getTwitterConfig } from '@/lib/twitter/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/twitter/status
 * Returns the analyst's X connection state for the settings UI. Never exposes
 * tokens — only safe identity fields and preferences.
 */
export async function GET() {
  const supabase = createClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const configured = getTwitterConfig() !== null

  const { data: account } = await supabase
    .from('twitter_accounts')
    .select('handle, display_name, auto_post, is_active, created_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    configured,
    connected: Boolean(account && account.is_active),
    account: account
      ? {
          handle: account.handle,
          displayName: account.display_name,
          autoPost: account.auto_post,
          connectedAt: account.created_at,
        }
      : null,
  })
}
