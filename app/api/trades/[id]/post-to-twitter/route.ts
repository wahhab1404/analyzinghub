import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import type { TradeFull } from '@/lib/types/trades'
import { renderContractTradePng } from '@/lib/companies/contract-trade-image'
import { getValidAccessToken } from '@/lib/twitter/account'
import { buildTradeTweet } from '@/lib/twitter/tweet-builder'
import { uploadMedia, postTweet } from '@/lib/twitter/client'
import { calcStockPnL, calcOptionPnL } from '@/lib/types/trades'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Peak gain % for the trade (option premium math when available). */
function peakGainPct(trade: TradeFull): number | null {
  const details = Array.isArray(trade.option_details) ? trade.option_details[0] : trade.option_details
  if (trade.trade_type === 'option' && details) return calcOptionPnL(details).highest_pct
  return calcStockPnL(trade).highest_pct
}

/**
 * POST /api/trades/[id]/post-to-twitter
 * Announce a winning trade on the analyst's own X account (image + Arabic text).
 * The analyst must own the trade and have a connected X account. A social_posts
 * row enforces one announcement per trade.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient(cookies())
    const { id } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Role: SuperAdmin may post any trade; analysts only their own (checked below).
    const { data: profile } = await supabase
      .from('profiles').select('roles(name)').eq('id', user.id).single()
    const roleName = (profile as any)?.roles?.name as string | undefined
    const isSuperAdmin = roleName === 'SuperAdmin'

    const { data: trade, error } = await supabase
      .from('trades')
      .select(`
        *,
        author:profiles!user_id(id, full_name, avatar_url),
        option_details:option_trade_details(*)
      `)
      .eq('id', id)
      .single()

    if (error || !trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    if (trade.user_id !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only announce winning trades.
    const gain = peakGainPct(trade as TradeFull)
    if (gain == null || gain <= 0) {
      return NextResponse.json(
        { error: 'Only profitable trades can be announced on X' },
        { status: 400 },
      )
    }

    // Dedup: one announcement per trade.
    const db = createServiceRoleClient()
    const { data: existing } = await db
      .from('social_posts')
      .select('id, status')
      .eq('trade_id', id)
      .eq('platform', 'twitter')
      .maybeSingle()
    if (existing && existing.status === 'sent') {
      return NextResponse.json({ error: 'Trade already announced on X', duplicate: true }, { status: 409 })
    }

    // Resolve a usable access token for the trade's owner (refresh if needed).
    let token
    try {
      token = await getValidAccessToken(db, trade.user_id)
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Your X token expired. Please reconnect your X account.' },
        { status: 401 },
      )
    }
    if (!token) {
      return NextResponse.json(
        { error: 'No X account connected. Connect it in Settings → Channel.' },
        { status: 400 },
      )
    }

    // Build text + (for option trades) the alert-card image.
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
        const mediaId = await uploadMedia(token.accessToken, new Uint8Array(png))
        mediaIds = [mediaId]
      } catch (imgErr: any) {
        // Image is best-effort; fall back to text-only rather than failing.
        console.error('[post-to-twitter] image/upload failed (text-only):', imgErr?.message)
      }
    }

    // Post and log the result.
    try {
      const tweet = await postTweet(token.accessToken, text, mediaIds)
      const postUrl = `https://x.com/${token.handle ?? 'i'}/status/${tweet.id}`

      await db.from('social_posts').upsert(
        {
          trade_id: id,
          user_id: trade.user_id,
          platform: 'twitter',
          post_id: tweet.id,
          post_url: postUrl,
          status: 'sent',
          error: null,
        },
        { onConflict: 'trade_id,platform' },
      )

      return NextResponse.json({ success: true, tweet_id: tweet.id, url: postUrl, with_image: Boolean(mediaIds) })
    } catch (postErr: any) {
      await db.from('social_posts').upsert(
        {
          trade_id: id,
          user_id: trade.user_id,
          platform: 'twitter',
          status: 'failed',
          error: String(postErr?.message ?? postErr).slice(0, 500),
        },
        { onConflict: 'trade_id,platform' },
      )
      return NextResponse.json({ error: postErr?.message ?? 'Failed to post to X' }, { status: 502 })
    }
  } catch (err: any) {
    console.error('[POST /api/trades/[id]/post-to-twitter]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
