/**
 * Build the Arabic announcement text for a winning trade tweet.
 *
 * Kept short to stay within X's 280-character limit; the trade-card image
 * carries the detailed numbers, so the text is a concise headline + CTA.
 */

import type { TradeFull } from '@/lib/types/trades'
import { calcStockPnL, calcOptionPnL } from '@/lib/types/trades'

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

/**
 * Compute the headline gain % for the trade (peak gain since entry), preferring
 * option premium math when option details are present.
 */
function gainPct(trade: TradeFull): number | null {
  const details = Array.isArray(trade.option_details)
    ? trade.option_details[0]
    : trade.option_details
  if (trade.trade_type === 'option' && details) {
    return calcOptionPnL(details).highest_pct
  }
  return calcStockPnL(trade).highest_pct
}

export function buildTradeTweet(trade: TradeFull): string {
  const details = Array.isArray(trade.option_details)
    ? trade.option_details[0]
    : trade.option_details

  const gain = gainPct(trade)
  const lines: string[] = []

  if (trade.trade_type === 'option' && details) {
    const typeAr = trade.direction === 'call' ? 'Call 🟢' : 'Put 🔴'
    lines.push(`🎯 صفقة ناجحة | ${details.underlying_symbol}`)
    lines.push('')
    lines.push(`📊 العقد: ${money(details.strike_price)} ${typeAr}`)
    lines.push(`💵 الدخول: ${money(details.entry_premium)}`)
    if (details.highest_premium_since_entry != null) {
      lines.push(`🏆 الأعلى: ${money(details.highest_premium_since_entry)}`)
    }
  } else {
    const dirAr = trade.direction === 'long' ? 'شراء 📈' : 'بيع 📉'
    lines.push(`🎯 صفقة ناجحة | ${trade.symbol}`)
    lines.push('')
    lines.push(`↕️ الاتجاه: ${dirAr}`)
    lines.push(`💵 الدخول: ${money(trade.entry_price)}`)
    if (trade.highest_price_since_entry != null) {
      lines.push(`🏆 الأعلى: ${money(trade.highest_price_since_entry)}`)
    }
  }

  if (gain != null) {
    lines.push(`📈 المكسب: ${pct(gain)} 🟢`)
  }

  lines.push('')
  lines.push('#تداول #تحليل #AnalyzingHub')

  let text = lines.join('\n')

  // Hard cap at 280 chars (X counts most emoji as 2; stay safe with a margin).
  if (text.length > 270) {
    text = text.slice(0, 269) + '…'
  }
  return text
}
