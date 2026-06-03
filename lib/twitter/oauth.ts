/**
 * X (Twitter) OAuth 2.0 (Authorization Code + PKCE) helpers.
 *
 * Flow:
 *  1. /api/twitter/connect   → build the authorize URL (PKCE challenge + state)
 *  2. user authorises on X   → X redirects back to the callback with ?code&state
 *  3. /api/twitter/callback  → exchange code (+ verifier) for tokens
 */

import crypto from 'crypto'

export const TWITTER_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize'
export const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'

// tweet.write → post; users.read → resolve handle; offline.access → refresh
// token; media.write → upload the trade-card image (Phase 2).
export const TWITTER_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access',
  'media.write',
]

// httpOnly cookies carrying the short-lived PKCE state between connect & callback.
export const STATE_COOKIE = 'tw_oauth_state'
export const VERIFIER_COOKIE = 'tw_oauth_verifier'

export interface Pkce {
  verifier: string
  challenge: string
}

export function generatePkce(): Pkce {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url')
}

export function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const url = new URL(TWITTER_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', TWITTER_SCOPES.join(' '))
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}
