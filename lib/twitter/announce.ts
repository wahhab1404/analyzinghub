/**
 * Shared core for announcing a winning trade on the owner's X account.
 *
 * A single `runAnnouncement` core works off a NormalizedAnnouncement; thin
 * adapters load each trade system (trades / index_trades / contract_trades) and
 * map it in. Handles: profit gate, dedup, token refresh, image render/upload,
 * posting, and social_posts logging.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TradeFull } from '@/lib/types/trades'
import { calcStockPnL, calcOptionPnL } from '@/lib/types/trades'
import { renderContractTradePng } from '@/lib/companies/contract-trade-image'
import { getValidAccessToken } from './account'
import { uploadMedia, postTweet } from './client'
import { buildTweetText, type NormalizedAnnouncement } from './normalized'
import { friendlyTwitterError } from './errors'

export interface AnnounceResult {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Post a normalized trade to its owner's X account. `db` must be a service-role
 * client (callers are responsible for auth/ownership checks).
 */
export async function runAnnouncement(
  db: SupabaseClient,
  n: NormalizedAnnouncement,
): Promise<AnnounceResult> {
  if (n.gainPct == null || n.gainPct <= 0) {
    return { ok: false, status: 400, body: { error: 'يمكن نشر الصفقات الرابحة فقط على X. (Only profitable trades can be announced on X.)' } }
  }

  // Dedup: one announcement per trade.
  const { data: existing } = await db
    .from('social_posts')
    .select('id, status')
    .eq('trade_id', n.id)
    .eq('platform', 'twitter')
    .maybeSingle()
  if (existing && existing.status === 'sent') {
    return { ok: false, status: 409, body: { error: 'تم نشر هذه الصفقة على X مسبقًا. (Trade already announced on X.)', duplicate: true } }
  }

  let token
  try {
    token = await getValidAccessToken(db, n.userId)
  } catch {
    return { ok: false, status: 401, body: { error: 'انتهت صلاحية ربط X — أعد ربط حسابك من الإعدادات. (X authorization expired; please reconnect.)' } }
  }
  if (!token) {
    return { ok: false, status: 400, body: { error: 'لا يوجد حساب X مرتبط — اربطه من الإعدادات → القناة. (No X account connected.)' } }
  }

  const text = buildTweetText(n)

  // Render the alert-card image for option contracts (best-effort).
  let mediaIds: string[] | undefined
  if (n.isOption && n.strike != null) {
    try {
      const png = await renderContractTradePng({
        symbol: n.symbol,
        strike: n.strike,
        direction: n.direction,
        expiry_date: n.expiry,
        entry_price: n.entryPrice,
        current_price: n.currentPrice,
        max_price_since_entry: n.highPrice,
        status: n.status,
      })
      mediaIds = [await uploadMedia(token.accessToken, new Uint8Array(png))]
    } catch (imgErr: any) {
      console.error('[announce] image/upload failed (text-only):', imgErr?.message)
    }
  }

  const logBase = {
    trade_id: n.id,
    user_id: n.userId,
    platform: 'twitter' as const,
    trade_source: n.source,
  }

  try {
    const tweet = await postTweet(token.accessToken, text, mediaIds)
    const postUrl = `https://x.com/${token.handle ?? 'i'}/status/${tweet.id}`

    await db.from('social_posts').upsert(
      { ...logBase, post_id: tweet.id, post_url: postUrl, status: 'sent', error: null },
      { onConflict: 'trade_id,platform' },
    )
    return { ok: true, status: 200, body: { success: true, tweet_id: tweet.id, url: postUrl, with_image: Boolean(mediaIds) } }
  } catch (postErr: any) {
    const raw = String(postErr?.message ?? postErr)
    // Log the raw error for diagnostics; show the analyst a friendly message.
    await db.from('social_posts').upsert(
      { ...logBase, status: 'failed', error: raw.slice(0, 500) },
      { onConflict: 'trade_id,platform' },
    )
    return { ok: false, status: 502, body: { error: friendlyTwitterError(raw) } }
  }
}

// ─── Adapters ───────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Unified trades module (`trades` + `option_trade_details`). */
export async function announceTradeOnTwitter(db: SupabaseClient, tradeId: string): Promise<AnnounceResult> {
  const { data: trade, error } = await db
    .from('trades')
    .select(`*, option_details:option_trade_details(*)`)
    .eq('id', tradeId)
    .single()
  if (error || !trade) return { ok: false, status: 404, body: { error: 'Trade not found' } }

  const details = Array.isArray(trade.option_details) ? trade.option_details[0] : trade.option_details
  const isOption = trade.trade_type === 'option'
  const gainPct = isOption && details ? calcOptionPnL(details).highest_pct : calcStockPnL(trade as TradeFull).highest_pct

  return runAnnouncement(db, {
    source: 'trades',
    id: trade.id,
    userId: trade.user_id,
    symbol: isOption && details ? details.underlying_symbol : trade.symbol,
    isOption,
    strike: isOption && details ? num(details.strike_price) : null,
    direction: trade.direction,
    expiry: isOption && details ? details.expiration_date : null,
    entryPrice: (isOption && details ? num(details.entry_premium) : num(trade.entry_price)) ?? 0,
    currentPrice: isOption && details ? num(details.current_premium) : num(trade.current_price),
    highPrice: isOption && details ? num(details.highest_premium_since_entry) : num(trade.highest_price_since_entry),
    status: trade.status,
    gainPct,
  })
}

/** Indices system (`index_trades`). Premium-based option contracts. */
export async function announceIndexTradeOnTwitter(db: SupabaseClient, tradeId: string): Promise<AnnounceResult> {
  const { data: t, error } = await db.from('index_trades').select('*').eq('id', tradeId).single()
  if (error || !t) return { ok: false, status: 404, body: { error: 'Trade not found' } }

  const snapshot = (t.entry_contract_snapshot ?? {}) as { price?: number; mid?: number }
  const entry = num(t.entry_price) ?? num(snapshot.price) ?? num(snapshot.mid) ?? 0
  const high = num(t.contract_high_since) ?? num(t.max_contract_price) ?? num(t.peak_price_after_entry)
  const gainPct = entry > 0 && high != null ? ((high - entry) / entry) * 100 : null

  return runAnnouncement(db, {
    source: 'index_trades',
    id: t.id,
    userId: t.author_id,
    symbol: t.underlying_index_symbol,
    isOption: t.instrument_type === 'options' && t.strike != null,
    strike: num(t.strike),
    direction: t.option_type ?? t.direction,
    expiry: t.expiry,
    entryPrice: entry,
    currentPrice: num(t.current_contract),
    highPrice: high,
    status: t.status,
    gainPct,
  })
}

/** Company standalone contracts (`contract_trades`). */
export async function announceContractTradeOnTwitter(db: SupabaseClient, tradeId: string): Promise<AnnounceResult> {
  const { data: t, error } = await db.from('contract_trades').select('*').eq('id', tradeId).single()
  if (error || !t) return { ok: false, status: 404, body: { error: 'Trade not found' } }

  const entry = num(t.entry_price) ?? 0
  const high = num(t.max_price_since_entry)
  const gainPct = entry > 0 && high != null ? ((high - entry) / entry) * 100 : null

  return runAnnouncement(db, {
    source: 'contract_trades',
    id: t.id,
    userId: t.author_id ?? t.created_by,
    symbol: t.symbol,
    isOption: t.strike != null,
    strike: num(t.strike),
    direction: t.direction,
    expiry: t.expiry_date,
    entryPrice: entry,
    currentPrice: num(t.current_price),
    highPrice: high,
    status: t.status,
    gainPct,
  })
}
