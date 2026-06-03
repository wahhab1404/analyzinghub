/**
 * Shared core for announcing a winning trade on the owner's X account.
 *
 * Used by both the manual route (POST /api/trades/[id]/post-to-twitter) and the
 * auto-post hook on trade completion. Handles: profit gate, dedup, token
 * refresh, image render/upload, posting, and social_posts logging.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TradeFull } from '@/lib/types/trades'
import { calcStockPnL, calcOptionPnL } from '@/lib/types/trades'
import { renderContractTradePng } from '@/lib/companies/contract-trade-image'
import { getValidAccessToken } from './account'
import { buildTradeTweet } from './tweet-builder'
import { uploadMedia, postTweet } from './client'

export interface AnnounceResult {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

function peakGainPct(trade: TradeFull): number | null {
  const details = Array.isArray(trade.option_details) ? trade.option_details[0] : trade.option_details
  if (trade.trade_type === 'option' && details) return calcOptionPnL(details).highest_pct
  return calcStockPnL(trade).highest_pct
}

/**
 * Post the trade to the owner's X account. `db` must be a service-role client
 * (the caller is responsible for any auth/ownership checks).
 */
export async function announceTradeOnTwitter(
  db: SupabaseClient,
  tradeId: string,
): Promise<AnnounceResult> {
  const { data: trade, error } = await db
    .from('trades')
    .select(`
      *,
      author:profiles!user_id(id, full_name, avatar_url),
      option_details:option_trade_details(*)
    `)
    .eq('id', tradeId)
    .single()

  if (error || !trade) {
    return { ok: false, status: 404, body: { error: 'Trade not found' } }
  }

  // Only announce winning trades.
  const gain = peakGainPct(trade as TradeFull)
  if (gain == null || gain <= 0) {
    return { ok: false, status: 400, body: { error: 'Only profitable trades can be announced on X' } }
  }

  // Dedup: one announcement per trade.
  const { data: existing } = await db
    .from('social_posts')
    .select('id, status')
    .eq('trade_id', tradeId)
    .eq('platform', 'twitter')
    .maybeSingle()
  if (existing && existing.status === 'sent') {
    return { ok: false, status: 409, body: { error: 'Trade already announced on X', duplicate: true } }
  }

  // Usable access token for the trade owner (refresh if needed).
  let token
  try {
    token = await getValidAccessToken(db, trade.user_id)
  } catch {
    return { ok: false, status: 401, body: { error: 'X token expired. Please reconnect your X account.' } }
  }
  if (!token) {
    return { ok: false, status: 400, body: { error: 'No X account connected.' } }
  }

  // Build text + (option trades only) the alert-card image.
  const text = buildTradeTweet(trade as TradeFull)

  let mediaIds: string[] | undefined
  if (trade.trade_type === 'option') {
    const od = Array.isArray(trade.option_details) ? trade.option_details[0] : trade.option_details
    try {
      const png = await renderContractTradePng({
        symbol: trade.symbol,
        strike: od?.strike_price ?? null,
        direction: trade.direction,
        expiry_date: od?.expiration_date ?? null,
        entry_price: trade.entry_price ?? od?.entry_premium ?? 0,
        current_price: trade.current_price ?? null,
        max_price_since_entry: od?.highest_premium_since_entry ?? null,
        status: trade.status,
      })
      mediaIds = [await uploadMedia(token.accessToken, new Uint8Array(png))]
    } catch (imgErr: any) {
      // Image is best-effort; fall back to text-only.
      console.error('[announce] image/upload failed (text-only):', imgErr?.message)
    }
  }

  try {
    const tweet = await postTweet(token.accessToken, text, mediaIds)
    const postUrl = `https://x.com/${token.handle ?? 'i'}/status/${tweet.id}`

    await db.from('social_posts').upsert(
      {
        trade_id: tradeId,
        user_id: trade.user_id,
        platform: 'twitter',
        post_id: tweet.id,
        post_url: postUrl,
        status: 'sent',
        error: null,
      },
      { onConflict: 'trade_id,platform' },
    )

    return { ok: true, status: 200, body: { success: true, tweet_id: tweet.id, url: postUrl, with_image: Boolean(mediaIds) } }
  } catch (postErr: any) {
    await db.from('social_posts').upsert(
      {
        trade_id: tradeId,
        user_id: trade.user_id,
        platform: 'twitter',
        status: 'failed',
        error: String(postErr?.message ?? postErr).slice(0, 500),
      },
      { onConflict: 'trade_id,platform' },
    )
    return { ok: false, status: 502, body: { error: postErr?.message ?? 'Failed to post to X' } }
  }
}
