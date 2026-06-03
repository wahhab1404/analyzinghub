import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getTwitterConfig } from '@/lib/twitter/config'
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from '@/lib/twitter/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/twitter/connect
 * Starts the X OAuth 2.0 (PKCE) flow: stores the state + verifier in short-lived
 * httpOnly cookies and redirects the analyst to X's authorize page.
 */
export async function GET() {
  const supabase = createClient(cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = getTwitterConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'Twitter integration is not configured on the server' },
      { status: 503 },
    )
  }

  const { verifier, challenge } = generatePkce()
  const state = generateState()

  const authorizeUrl = buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    challenge,
  })

  const res = NextResponse.redirect(authorizeUrl)
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 minutes to complete the flow
  }
  res.cookies.set(STATE_COOKIE, state, cookieOpts)
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieOpts)
  return res
}
