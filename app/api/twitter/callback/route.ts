import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getAppBaseUrl } from '@/lib/twitter/config'
import { STATE_COOKIE, VERIFIER_COOKIE } from '@/lib/twitter/oauth'
import { exchangeCodeForToken, getMe } from '@/lib/twitter/client'
import { encryptToken } from '@/lib/twitter/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTINGS_PATH = '/dashboard/settings?tab=channel'

function redirectToSettings(status: 'connected' | 'error', detail?: string) {
  const url = new URL(`${getAppBaseUrl()}${SETTINGS_PATH}`)
  url.searchParams.set('twitter', status)
  if (detail) url.searchParams.set('twitter_error', detail)
  return NextResponse.redirect(url.toString())
}

/**
 * GET /api/twitter/callback
 * Completes the OAuth flow: validates state, exchanges the code for tokens,
 * resolves the analyst's X identity, and upserts an encrypted twitter_accounts
 * row. Always redirects back to the settings page with a status flag.
 */
export async function GET(req: NextRequest) {
  const cookieStore = cookies()
  const { searchParams } = new URL(req.url)

  const oauthError = searchParams.get('error')
  if (oauthError) {
    return redirectToSettings('error', oauthError)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const savedState = cookieStore.get(STATE_COOKIE)?.value
  const verifier = cookieStore.get(VERIFIER_COOKIE)?.value

  if (!code || !state || !savedState || state !== savedState || !verifier) {
    return redirectToSettings('error', 'invalid_state')
  }

  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return redirectToSettings('error', 'not_authenticated')
  }

  try {
    const tokens = await exchangeCodeForToken(code, verifier)
    const me = await getMe(tokens.access_token)

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Service role: the OAuth callback writes the row on the user's behalf.
    const db = createServiceRoleClient()
    const { error } = await db
      .from('twitter_accounts')
      .upsert(
        {
          user_id: user.id,
          twitter_user_id: me.id,
          handle: me.username,
          display_name: me.name,
          access_token: encryptToken(tokens.access_token),
          refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
          token_expires_at: expiresAt,
          scope: tokens.scope ?? null,
          is_active: true,
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      console.error('[twitter/callback] upsert failed:', error)
      return redirectToSettings('error', 'save_failed')
    }

    const res = redirectToSettings('connected')
    // Clear the short-lived PKCE cookies.
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 })
    res.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  } catch (err: any) {
    console.error('[twitter/callback] error:', err)
    return redirectToSettings('error', 'exchange_failed')
  }
}
