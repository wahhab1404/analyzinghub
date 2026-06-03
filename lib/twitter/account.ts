/**
 * Server-side helpers for working with a connected analyst X account.
 *
 * Centralises the "give me a usable access token" logic: load the row, decrypt,
 * and transparently refresh + persist when the token is expired or about to be.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from './crypto'
import { refreshAccessToken } from './client'

export interface ValidToken {
  accessToken: string
  handle: string | null
}

const REFRESH_SKEW_MS = 60_000 // refresh if <60s of validity remains

/**
 * Return a valid access token for the analyst, refreshing it if needed, or null
 * when the analyst has no active X connection.
 */
export async function getValidAccessToken(
  db: SupabaseClient,
  userId: string,
): Promise<ValidToken | null> {
  const { data: account } = await db
    .from('twitter_accounts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!account || !account.is_active) return null

  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0
  const stillValid = expiresAt - Date.now() > REFRESH_SKEW_MS

  if (stillValid || !account.refresh_token) {
    // Either fresh enough, or we have no way to refresh — use what we have.
    return { accessToken: decryptToken(account.access_token), handle: account.handle }
  }

  const tokens = await refreshAccessToken(decryptToken(account.refresh_token))
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await db
    .from('twitter_accounts')
    .update({
      access_token: encryptToken(tokens.access_token),
      refresh_token: tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : account.refresh_token,
      token_expires_at: newExpiry,
      scope: tokens.scope ?? account.scope,
    })
    .eq('user_id', userId)

  return { accessToken: tokens.access_token, handle: account.handle }
}
