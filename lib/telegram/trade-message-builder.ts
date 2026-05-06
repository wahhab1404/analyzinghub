/**
 * Telegram Message Builder — Trades
 *
 * Builds bilingual (Arabic/English) Telegram HTML messages for trade events:
 * - New trade published
 * - Target hit update
 * - New high watermark
 * - Stop loss hit
 * - Trade completed / summary
 */

import { escapeHtml } from './symbol-utils'
import type { TradeFull, TradeTarget } from '@/lib/types/trades'

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function directionEmoji(direction: string): string {
  switch (direction) {
    case 'long':  return '📈'
    case 'short': return '📉'
    case 'call':  return '🟢'
    case 'put':   return '🔴'
    default:      return '⚡'
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'active':    return '🟢'
    case 'stopped':   return '🔴'
    case 'completed': return '✅'
    case 'expired':   return '⏰'
    default:          return '⏳'
  }
}

function riskLabel(level: string | null): string {
  switch (level) {
    case 'low':       return '🟢 منخفض / Low'
    case 'medium':    return '🟡 متوسط / Medium'
    case 'high':      return '🟠 عالي / High'
    case 'very_high': return '🔴 عالي جداً / Very High'
    default:          return '—'
  }
}

function directionLabel(direction: string): string {
  switch (direction) {
    case 'long':  return 'شراء / Long'
    case 'short': return 'بيع / Short'
    case 'call':  return 'Call 🟢'
    case 'put':   return 'Put 🔴'
    default:      return direction
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW STOCK TRADE
// ─────────────────────────────────────────────────────────────────────────────

export function buildNewStockTradeMessage(trade: TradeFull, baseUrl: string): string {
  const dir = directionEmoji(trade.direction)
  const symbol = escapeHtml(trade.symbol)
  const authorName = escapeHtml(trade.author?.full_name ?? 'محلل / Analyst')

  let msg = `${dir} <b>صفقة جديدة / New Trade Alert</b>\n\n`
  msg += `📌 <b>الرمز / Symbol:</b> <code>${symbol}</code>\n`
  msg += `💼 <b>النوع / Type:</b> سهم / Stock\n`
  msg += `↕️ <b>الاتجاه / Direction:</b> ${directionLabel(trade.direction)}\n`
  msg += `\n`
  msg += `💵 <b>سعر الدخول / Entry:</b> <code>$${fmt(trade.entry_price)}</code>\n`
  msg += `🛑 <b>وقف الخسارة / Stop Loss:</b> <code>$${fmt(trade.stop_loss)}</code>\n`
  msg += `\n`

  // Targets
  if (trade.targets && trade.targets.length > 0) {
    msg += `🎯 <b>الأهداف / Targets:</b>\n`
    trade.targets.forEach((t: TradeTarget) => {
      msg += `  • ${escapeHtml(t.label)}: <code>$${fmt(t.price)}</code>\n`
    })
    msg += `\n`
  }

  if (trade.timeframe) {
    msg += `⏱ <b>الإطار الزمني / Timeframe:</b> ${escapeHtml(trade.timeframe)}\n`
  }
  if (trade.expected_duration) {
    msg += `🕐 <b>المدة المتوقعة / Duration:</b> ${escapeHtml(trade.expected_duration)}\n`
  }
  if (trade.risk_level) {
    msg += `⚠️ <b>مستوى المخاطرة / Risk:</b> ${riskLabel(trade.risk_level)}\n`
  }

  msg += `\n👤 <b>المحلل / Analyst:</b> ${authorName}\n`

  if (trade.analysis?.id) {
    msg += `\n🔗 <a href="${baseUrl}/dashboard/analysis/${trade.analysis.id}">📊 عرض التحليل / View Analysis</a>\n`
  }

  if (trade.is_testing) {
    msg += `\n⚙️ <i>هذه صفقة اختبارية / Testing Trade</i>\n`
  }

  msg += `\n<i>⚠️ هذا ليس نصيحة مالية. تداول على مسؤوليتك الخاصة.</i>`
  msg += `\n<i>⚠️ Not financial advice. Trade at your own risk.</i>`

  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW OPTION TRADE
// ─────────────────────────────────────────────────────────────────────────────

export function buildNewOptionTradeMessage(trade: TradeFull, baseUrl: string): string {
  const details = trade.option_details
  if (!details) return buildNewStockTradeMessage(trade, baseUrl)

  const dir = directionEmoji(trade.direction)
  const symbol = escapeHtml(details.underlying_symbol)
  const authorName = escapeHtml(trade.author?.full_name ?? 'محلل / Analyst')
  const optType = trade.direction === 'call' ? 'Call 🟢' : 'Put 🔴'

  let msg = `${dir} <b>صفقة عقد جديدة / New Contract Alert</b>\n\n`
  msg += `📌 <b>الرمز / Symbol:</b> <code>${symbol}</code>\n`
  msg += `💼 <b>النوع / Type:</b> خيارات / Options\n`
  msg += `📊 <b>الخيار / Option:</b> ${optType}\n`
  msg += `\n`
  msg += `🎯 <b>سعر الإضراب / Strike:</b> <code>$${fmt(details.strike_price)}</code>\n`
  msg += `📅 <b>تاريخ الانتهاء / Expiry:</b> <code>${details.expiration_date}</code>\n`

  if (details.contract_symbol) {
    msg += `🔤 <b>رمز العقد / Contract:</b> <code>${escapeHtml(details.contract_symbol)}</code>\n`
  }

  msg += `\n`
  msg += `💵 <b>سعر الدخول / Entry Premium:</b> <code>$${fmt(details.entry_premium)}</code>\n`

  if (details.stop_premium) {
    msg += `🛑 <b>وقف الخسارة / Stop:</b> <code>$${fmt(details.stop_premium)}</code>\n`
  } else if (details.stop_rule) {
    msg += `🛑 <b>قاعدة الوقف / Stop Rule:</b> ${escapeHtml(details.stop_rule)}\n`
  }

  if (details.quantity && details.quantity > 1) {
    msg += `📦 <b>الكمية / Qty:</b> ${details.quantity} عقد / contracts\n`
  }

  // Targets
  if (trade.targets && trade.targets.length > 0) {
    msg += `\n🎯 <b>الأهداف / Targets:</b>\n`
    trade.targets.forEach((t: TradeTarget) => {
      msg += `  • ${escapeHtml(t.label)}: <code>$${fmt(t.price)}</code>\n`
    })
  }

  if (trade.expected_duration) {
    msg += `\n🕐 <b>المدة المتوقعة / Duration:</b> ${escapeHtml(trade.expected_duration)}\n`
  }
  if (trade.risk_level) {
    msg += `⚠️ <b>مستوى المخاطرة / Risk:</b> ${riskLabel(trade.risk_level)}\n`
  }

  msg += `\n👤 <b>المحلل / Analyst:</b> ${authorName}\n`

  if (trade.analysis?.id) {
    msg += `\n🔗 <a href="${baseUrl}/dashboard/analysis/${trade.analysis.id}">📊 عرض التحليل / View Analysis</a>\n`
  }

  msg += `\n<i>⚠️ هذا ليس نصيحة مالية.</i> <i>Not financial advice.</i>`

  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGET HIT
// ─────────────────────────────────────────────────────────────────────────────

export function buildTargetHitMessage(trade: TradeFull, targetIndex: number, currentPrice: number): string {
  const target = trade.targets[targetIndex]
  if (!target) return ''

  const dir = directionEmoji(trade.direction)
  const symbol = escapeHtml(trade.symbol)
  const hitCount = trade.targets.filter((t: TradeTarget) => t.hit).length
  const remaining = trade.targets.filter((t: TradeTarget) => !t.hit)

  let msg = `🎯 <b>تم تحقيق الهدف! / Target Hit!</b>\n\n`
  msg += `${dir} <b>${escapeHtml(target.label)}</b> — <code>${symbol}</code>\n\n`
  msg += `💹 <b>السعر الحالي / Current:</b> <code>$${fmt(currentPrice)}</code>\n`
  msg += `🏆 <b>أعلى سعر / Highest:</b> <code>$${fmt(trade.highest_price_since_entry)}</code>\n`
  msg += `📥 <b>سعر الدخول / Entry:</b> <code>$${fmt(trade.entry_price)}</code>\n`

  if (trade.entry_price) {
    const pnlPct = trade.direction === 'long'
      ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
      : ((trade.entry_price - currentPrice) / trade.entry_price) * 100
    msg += `📊 <b>الربح / P&L:</b> <code>${pct(pnlPct)}</code>\n`
  }

  msg += `\n✅ <b>الأهداف المحققة / Targets Hit:</b> ${hitCount}/${trade.targets.length}\n`

  if (remaining.length > 0) {
    msg += `\n🎯 <b>الأهداف المتبقية / Remaining:</b>\n`
    remaining.forEach((t: TradeTarget) => {
      msg += `  • ${escapeHtml(t.label)}: <code>$${fmt(t.price)}</code>\n`
    })
  }

  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// STOP HIT
// ─────────────────────────────────────────────────────────────────────────────

export function buildStopHitMessage(trade: TradeFull, currentPrice: number): string {
  const symbol = escapeHtml(trade.symbol)

  let pnlPct: number | null = null
  if (trade.entry_price) {
    pnlPct = trade.direction === 'long'
      ? ((currentPrice - trade.entry_price) / trade.entry_price) * 100
      : ((trade.entry_price - currentPrice) / trade.entry_price) * 100
  }

  let msg = `🛑 <b>تم ضرب وقف الخسارة / Stop Loss Hit</b>\n\n`
  msg += `📌 <code>${symbol}</code>\n\n`
  msg += `💵 <b>سعر الدخول / Entry:</b> <code>$${fmt(trade.entry_price)}</code>\n`
  msg += `🛑 <b>سعر الوقف / Stop:</b> <code>$${fmt(trade.stop_loss)}</code>\n`
  msg += `💹 <b>السعر الحالي / Current:</b> <code>$${fmt(currentPrice)}</code>\n`

  if (pnlPct != null) {
    msg += `📊 <b>النتيجة / Result:</b> <code>${pct(pnlPct)}</code>\n`
  }

  const hitCount = trade.targets.filter((t: TradeTarget) => t.hit).length
  if (hitCount > 0) {
    msg += `\n✅ <b>أهداف محققة / Targets Hit:</b> ${hitCount}/${trade.targets.length}\n`
  }

  msg += `\n<i>الصفقة مغلقة / Trade closed.</i>`

  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// TRADE COMPLETED / FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export function buildTradeSummaryMessage(trade: TradeFull): string {
  const dir = directionEmoji(trade.direction)
  const status = statusEmoji(trade.status)
  const symbol = escapeHtml(trade.symbol)

  let pnlPct: number | null = null
  const refPrice = trade.highest_price_since_entry ?? trade.current_price
  if (trade.entry_price && refPrice) {
    pnlPct = trade.direction === 'long'
      ? ((refPrice - trade.entry_price) / trade.entry_price) * 100
      : ((trade.entry_price - refPrice) / trade.entry_price) * 100
  }

  const hitCount = trade.targets.filter((t: TradeTarget) => t.hit).length
  const isWin = (pnlPct ?? 0) > 0 && hitCount > 0

  let msg = `${status} <b>ملخص الصفقة / Trade Summary</b>\n\n`
  msg += `${dir} <code>${symbol}</code> — ${directionLabel(trade.direction)}\n\n`
  msg += `💵 <b>سعر الدخول / Entry:</b> <code>$${fmt(trade.entry_price)}</code>\n`
  msg += `🏆 <b>أعلى سعر / Highest:</b> <code>$${fmt(trade.highest_price_since_entry)}</code>\n`
  msg += `💹 <b>السعر الأخير / Final:</b> <code>$${fmt(trade.current_price)}</code>\n`

  if (pnlPct != null) {
    const emoji = isWin ? '💚' : '❌'
    msg += `${emoji} <b>العائد / Return:</b> <code>${pct(pnlPct)}</code>\n`
  }

  msg += `\n✅ <b>أهداف محققة / Targets Hit:</b> ${hitCount}/${trade.targets.length}\n`

  const statusLabels: Record<string, string> = {
    completed: '✅ مكتملة / Completed',
    stopped:   '🛑 موقوفة / Stopped',
    expired:   '⏰ منتهية / Expired',
    cancelled: '🚫 ملغاة / Cancelled',
  }
  msg += `📋 <b>الحالة / Status:</b> ${statusLabels[trade.status] ?? trade.status}\n`

  if (trade.analysis?.id) {
    msg += `\n🔗 عرض التحليل / View Analysis: /analysis_${trade.analysis.id.split('-')[0]}\n`
  }

  return msg
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export function buildTradeMessage(
  eventType: 'new' | 'target_hit' | 'stop_hit' | 'summary',
  trade: TradeFull,
  opts: { targetIndex?: number; currentPrice?: number; baseUrl?: string } = {}
): string {
  const base = opts.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://analyzinghub.com'

  switch (eventType) {
    case 'new':
      return trade.trade_type === 'option'
        ? buildNewOptionTradeMessage(trade, base)
        : buildNewStockTradeMessage(trade, base)
    case 'target_hit':
      return buildTargetHitMessage(trade, opts.targetIndex ?? 0, opts.currentPrice ?? trade.current_price ?? 0)
    case 'stop_hit':
      return buildStopHitMessage(trade, opts.currentPrice ?? trade.current_price ?? 0)
    case 'summary':
      return buildTradeSummaryMessage(trade)
    default:
      return ''
  }
}
