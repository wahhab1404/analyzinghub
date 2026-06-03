/**
 * Twitter (X) integration — environment configuration.
 *
 * The platform owns a single X OAuth 2.0 app (confidential "Web App" client).
 * Each analyst authorises that app against their own X account; the resulting
 * per-analyst tokens are stored (encrypted) in `twitter_accounts`.
 */

export interface TwitterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Resolve the X app credentials from the environment. Returns null when the
 * integration has not been configured, so callers can fail gracefully with a
 * clear "not configured" message instead of throwing.
 */
export function getTwitterConfig(): TwitterConfig | null {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET
  const redirectUri =
    process.env.TWITTER_REDIRECT_URI ?? `${getAppBaseUrl()}/api/twitter/callback`

  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, redirectUri }
}

/**
 * Public base URL of the app, used for OAuth redirects and post links.
 * Mirrors the fallbacks used elsewhere in the codebase.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    'https://analyzinghub.com'
  )
}
