/**
 * A normalized shape that any of the platform's trade systems can map into, so
 * a single X announcement path serves all of them:
 *   - trades            (unified trades module)
 *   - index_trades      (indices / SPX system)
 *   - contract_trades   (company standalone option contracts)
 */

export type TradeSource = 'trades' | 'index_trades' | 'contract_trades'

export interface NormalizedAnnouncement {
  source: TradeSource
  id: string
  userId: string // owner whose connected X account posts
  symbol: string
  isOption: boolean
  strike: number | null
  direction: string // call | put | long | short
  expiry: string | null
  entryPrice: number
  currentPrice: number | null
  highPrice: number | null
  status: string | null
  /** Peak gain % since entry, pre-computed by each adapter (handles stock vs premium math). */
  gainPct: number | null
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

/**
 * Build the short Arabic announcement text (≤280 chars). The attached trade-card
 * image carries the detail, so the text is a concise headline + CTA.
 */
export function buildTweetText(n: NormalizedAnnouncement): string {
  const lines: string[] = []

  if (n.isOption && n.strike != null) {
    const typeAr = n.direction === 'put' ? 'Put 🔴' : 'Call 🟢'
    lines.push(`🎯 صفقة ناجحة | ${n.symbol}`)
    lines.push('')
    lines.push(`📊 العقد: ${fmtMoney(n.strike)} ${typeAr}`)
    lines.push(`💵 الدخول: ${fmtMoney(n.entryPrice)}`)
    if (n.highPrice != null) lines.push(`🏆 الأعلى: ${fmtMoney(n.highPrice)}`)
  } else {
    const dirAr = n.direction === 'short' ? 'بيع 📉' : 'شراء 📈'
    lines.push(`🎯 صفقة ناجحة | ${n.symbol}`)
    lines.push('')
    lines.push(`↕️ الاتجاه: ${dirAr}`)
    lines.push(`💵 الدخول: ${fmtMoney(n.entryPrice)}`)
    if (n.highPrice != null) lines.push(`🏆 الأعلى: ${fmtMoney(n.highPrice)}`)
  }

  if (n.gainPct != null) lines.push(`📈 المكسب: ${fmtPct(n.gainPct)} 🟢`)

  lines.push('')
  lines.push('#تداول #تحليل #AnalyzingHub')

  let text = lines.join('\n')
  if (text.length > 270) text = text.slice(0, 269) + '…'
  return text
}
