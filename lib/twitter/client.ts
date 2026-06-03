/**
 * X (Twitter) API v2 client — low-level calls.
 *
 * Phase 1 covers the OAuth token lifecycle and identity lookup:
 *  - exchangeCodeForToken : authorization code → access/refresh tokens
 *  - refreshAccessToken   : refresh token → new access token
 *  - getMe                : access token → { id, username, name }
 *
 * Posting (media upload + create tweet) is added in a later phase.
 *
 * Confidential client auth: token endpoints use HTTP Basic with the app's
 * client_id:client_secret. `client_id` is also sent in the body per X's spec.
 */

import { TWITTER_TOKEN_URL } from './oauth'
import { getTwitterConfig } from './config'

export interface TwitterTokens {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number // seconds
  scope?: string
}

export interface TwitterUser {
  id: string
  username: string
  name: string
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<TwitterTokens> {
  const config = getTwitterConfig()
  if (!config) throw new Error('Twitter integration not configured')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
    client_id: config.clientId,
  })

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
    },
    body,
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${json.error_description || json.error || res.status}`)
  }
  return json as TwitterTokens
}

/** Refresh an access token using a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<TwitterTokens> {
  const config = getTwitterConfig()
  if (!config) throw new Error('Twitter integration not configured')

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  })

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
    },
    body,
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${json.error_description || json.error || res.status}`)
  }
  return json as TwitterTokens
}

/** Resolve the authenticated user's id / handle / display name. */
export async function getMe(accessToken: string): Promise<TwitterUser> {
  const res = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(`Failed to fetch X profile: ${json.title || json.detail || res.status}`)
  }
  return json.data as TwitterUser
}
