'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, Clock, ChevronRight } from 'lucide-react'

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface OptionsContractData {
  id: string
  underlying_index_symbol: string
  polygon_option_ticker?: string | null
  option_type?: string | null
  direction: string
  strike?: number | null
  expiry?: string | null
  qty?: number
  contract_multiplier?: number | string
  entry_contract_snapshot: {
    mid: number
    bid?: number
    ask?: number
    implied_volatility?: number
    delta?: number
    gamma?: number
    theta?: number
    vega?: number
  }
  entry_underlying_snapshot?: { price: number }
  current_contract: number
  contract_high_since: number
  contract_low_since?: number
  status: string
  is_win?: boolean
  computed_profit_usd?: number
  created_at: string
  closed_at?: string
  targets?: Array<{ price: number; percentage: number; hit?: boolean }>
  stoploss?: { price: number; percentage: number }
  author?: { id: string; full_name: string }
  analysis?: { id: string; title: string }
}

interface OptionsContractCardProps {
  trade: OptionsContractData
  /** Compact single-row card (used in lists/feeds). Default: false = full card */
  compact?: boolean
  /** Link destination for "Monitor" action */
  monitorHref?: string
  className?: string
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const n2 = (v: number) => v.toFixed(2)
const n1 = (v: number) => v.toFixed(1)
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

function fmtExpiry(expiry: string | null | undefined, short = false): string {
  if (!expiry) return '—'
  const d = new Date(expiry)
  if (short) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function daysToExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null
  const ms = new Date(expiry).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

function multiplierOf(t: OptionsContractData): number {
  return typeof t.contract_multiplier === 'string'
    ? parseFloat(t.contract_multiplier) || 100
    : (t.contract_multiplier || 100)
}

function computePnL(t: OptionsContractData) {
  const entry = t.entry_contract_snapshot?.mid || 0
  const current = t.current_contract || 0
  const high = t.contract_high_since || current
  const mult = multiplierOf(t)
  const qty = t.qty || 1

  const openPct = entry > 0 ? ((current - entry) / entry) * 100 : 0
  const highPct = entry > 0 ? ((high - entry) / entry) * 100 : 0
  const openUsd = (current - entry) * qty * mult
  const highUsd = (high - entry) * qty * mult

  return { entry, current, high, openPct, highPct, openUsd, highUsd, mult, qty }
}

/* ─── Greeks mini-row ────────────────────────────────────────────────────── */

function GreekCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/70">{label}</span>
      <span className={cn('text-[11px] font-bold num leading-none', className)}>{value}</span>
    </div>
  )
}

/* ─── P&L Progress bar ───────────────────────────────────────────────────── */

function PnLBar({ pct: pnlPct }: { pct: number }) {
  const clampedAbs = Math.min(Math.abs(pnlPct), 200)
  const barWidth = (clampedAbs / 200) * 100
  const isPos = pnlPct >= 0
  return (
    <div className="h-1 bg-muted/50 overflow-hidden w-full">
      <div
        className={cn('h-full transition-all', isPos ? 'bg-emerald-500' : 'bg-red-500')}
        style={{ width: `${barWidth}%` }}
      />
    </div>
  )
}

/* ─── Status accent border ───────────────────────────────────────────────── */

function statusBorderColor(pct: number, status: string): string {
  if (status === 'active') {
    if (pct > 5) return 'border-l-emerald-500'
    if (pct < -5) return 'border-l-red-500'
    return 'border-l-amber-500'
  }
  if (status === 'tp_hit') return 'border-l-emerald-500'
  if (status === 'sl_hit') return 'border-l-red-500'
  return 'border-l-border'
}

/* ─── FULL card ──────────────────────────────────────────────────────────── */

function FullCard({ trade, monitorHref, className }: {
  trade: OptionsContractData
  monitorHref?: string
  className?: string
}) {
  const { entry, current, high, openPct, highPct, openUsd } = computePnL(trade)
  const snap = trade.entry_contract_snapshot
  const iv = snap?.implied_volatility
  const delta = snap?.delta
  const gamma = snap?.gamma
  const theta = snap?.theta
  const vega = snap?.vega
  const dte = daysToExpiry(trade.expiry)

  const isCall = trade.option_type === 'call' || trade.direction === 'call' || trade.direction === 'long'
  const isActive = trade.status === 'active'
  const isWin = trade.status === 'tp_hit' || trade.is_win === true
  const isLoss = trade.status === 'sl_hit' || trade.is_win === false

  const hasGreeks = iv != null || delta != null || gamma != null || theta != null || vega != null
  const hasTargets = trade.targets && trade.targets.length > 0
  const borderClass = statusBorderColor(openPct, trade.status)

  return (
    <div className={cn(
      'opt-card border-l-2 opt-card-hover',
      borderClass,
      className,
    )}>

      {/* ── Header row ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* CALL / PUT badge */}
          <span className={cn('opt-dir-badge', isCall ? 'opt-dir-call' : 'opt-dir-put')}>
            {isCall ? 'CALL' : 'PUT'}
          </span>

          {/* Underlying symbol */}
          <span className="text-base font-black text-foreground tracking-tight">
            {trade.underlying_index_symbol}
          </span>

          {/* Strike */}
          {trade.strike != null && (
            <span className="text-sm font-black num text-foreground/90">
              ${trade.strike.toLocaleString()}
            </span>
          )}

          {/* Status badge */}
          {isActive && (
            <span className="opt-status-badge opt-status-active">LIVE</span>
          )}
          {isWin && (
            <span className="opt-status-badge opt-status-win">TARGET ✓</span>
          )}
          {isLoss && (
            <span className="opt-status-badge opt-status-loss">STOPPED</span>
          )}
          {!isActive && !isWin && !isLoss && (
            <span className="opt-status-badge opt-status-neutral">CLOSED</span>
          )}
        </div>

        {/* P&L headline */}
        <div className="text-right flex-shrink-0">
          {openPct >= 1 || openPct <= -1 ? (
            <div className={cn('flex items-center gap-1 justify-end', openPct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {openPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="text-xl font-black num leading-none">{pct(openPct)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 justify-end text-muted-foreground">
              <Minus className="h-3 w-3" />
              <span className="text-xl font-black num leading-none">FLAT</span>
            </div>
          )}
          <div className={cn('text-xs font-semibold num mt-0.5', openUsd >= 0 ? 'text-emerald-500/80' : 'text-red-500/80')}>
            {openUsd >= 0 ? '+' : ''}${Math.abs(openUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* P&L bar */}
      <PnLBar pct={openPct} />

      {/* Polygon ticker */}
      {trade.polygon_option_ticker && (
        <div className="px-4 pt-1.5 pb-0">
          <span className="opt-ticker-text">{trade.polygon_option_ticker}</span>
        </div>
      )}

      {/* ── Price metrics ────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 px-4 py-2.5 border-t border-border/60 mt-2">
        <div>
          <p className="opt-metric-label">ENTRY $</p>
          <p className="opt-metric-value text-muted-foreground">{n2(entry)}</p>
        </div>
        <div>
          <p className="opt-metric-label">CURRENT $</p>
          <p className={cn('opt-metric-value', current > entry ? 'text-emerald-500' : current < entry ? 'text-red-500' : 'text-foreground')}>
            {n2(current)}
          </p>
        </div>
        <div>
          <p className="opt-metric-label">HIGH $</p>
          <p className="opt-metric-value text-emerald-500/90">{n2(high)}</p>
          <p className="text-[9px] text-emerald-500/60 num">{pct(highPct)}</p>
        </div>
        <div>
          <p className="opt-metric-label">EXPIRY</p>
          <p className="opt-metric-value text-foreground">{fmtExpiry(trade.expiry)}</p>
          {dte != null && (
            <p className={cn('text-[9px] num', dte <= 5 ? 'text-red-500' : dte <= 14 ? 'text-amber-500' : 'text-muted-foreground')}>
              {dte > 0 ? `${dte}d left` : dte === 0 ? 'EXP TODAY' : 'EXPIRED'}
            </p>
          )}
        </div>
      </div>

      {/* ── Greeks row ───────────────────────────────────── */}
      {hasGreeks && (
        <div className="flex items-center justify-around px-4 py-2.5 border-t border-border/60 bg-muted/5">
          {iv != null && (
            <GreekCell
              label="IV"
              value={`${(iv * 100).toFixed(1)}%`}
              className={iv > 0.4 ? 'text-amber-500' : iv > 0.25 ? 'text-foreground' : 'text-emerald-500/80'}
            />
          )}
          {delta != null && (
            <GreekCell
              label="Δ DELTA"
              value={n2(delta)}
              className={Math.abs(delta) > 0.5 ? 'text-blue-400' : 'text-foreground'}
            />
          )}
          {gamma != null && (
            <GreekCell label="Γ GAMMA" value={gamma.toFixed(4)} className="text-purple-400/80" />
          )}
          {theta != null && (
            <GreekCell label="Θ THETA" value={n2(theta)} className="text-red-400/80" />
          )}
          {vega != null && (
            <GreekCell label="V VEGA" value={n2(vega)} className="text-cyan-400/80" />
          )}
        </div>
      )}

      {/* ── Targets + Stop loss ──────────────────────────── */}
      {(hasTargets || trade.stoploss) && (
        <div className="px-4 py-2 border-t border-border/60 flex items-center gap-2 flex-wrap">
          {trade.targets?.map((tgt, i) => (
            <span
              key={i}
              className={cn(
                'text-[10px] px-1.5 py-0.5 border font-bold num',
                tgt.hit
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                  : 'bg-muted/40 text-muted-foreground border-border/60'
              )}
            >
              TP{i + 1} ${tgt.price.toFixed(2)}{tgt.hit ? ' ✓' : ''}
            </span>
          ))}
          {trade.stoploss && (
            <span className="text-[10px] px-1.5 py-0.5 border font-bold num bg-red-500/10 text-red-500 border-red-500/25">
              SL ${trade.stoploss.price.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/5">
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          {trade.author && (
            <span className="font-semibold text-foreground/60">{trade.author.full_name}</span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {new Date(trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {trade.entry_underlying_snapshot?.price != null && (
            <span className="num">@{n2(trade.entry_underlying_snapshot.price)}</span>
          )}
        </div>
        {monitorHref && trade.status === 'active' && (
          <Link
            href={monitorHref}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline font-semibold"
          >
            Monitor <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  )
}

/* ─── COMPACT row card ───────────────────────────────────────────────────── */

function CompactCard({ trade, monitorHref, className }: {
  trade: OptionsContractData
  monitorHref?: string
  className?: string
}) {
  const { entry, current, high, openPct, highPct } = computePnL(trade)
  const snap = trade.entry_contract_snapshot
  const iv = snap?.implied_volatility
  const delta = snap?.delta
  const theta = snap?.theta

  const isCall = trade.option_type === 'call' || trade.direction === 'call' || trade.direction === 'long'
  const borderClass = statusBorderColor(openPct, trade.status)
  const dte = daysToExpiry(trade.expiry)

  return (
    <div className={cn('opt-row border-l-[3px] group', borderClass, className)}>
      {/* Left: symbol + type */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0" style={{ width: 140 }}>
        <span className={cn('opt-dir-badge-sm', isCall ? 'opt-dir-call' : 'opt-dir-put')}>
          {isCall ? 'C' : 'P'}
        </span>
        <div className="min-w-0">
          <div className="text-xs font-black text-foreground leading-none">{trade.underlying_index_symbol}</div>
          <div className="text-[9px] text-muted-foreground num leading-none mt-0.5">
            {trade.strike ? `$${trade.strike.toLocaleString()}` : '—'}
            {' · '}
            {fmtExpiry(trade.expiry, true)}
          </div>
        </div>
      </div>

      {/* Mid: price metrics */}
      <div className="flex items-center gap-4 flex-1 min-w-0 px-2">
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">Entry</p>
          <p className="text-[11px] num text-muted-foreground">${n2(entry)}</p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">Now</p>
          <p className={cn('text-[11px] num font-bold', current > entry ? 'text-emerald-500' : current < entry ? 'text-red-500' : 'text-foreground')}>
            ${n2(current)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">High</p>
          <p className="text-[11px] num text-emerald-500/80">${n2(high)}</p>
        </div>
        {iv != null && (
          <div className="text-center hidden sm:block">
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">IV</p>
            <p className="text-[11px] num text-amber-500/80">{(iv * 100).toFixed(0)}%</p>
          </div>
        )}
        {delta != null && (
          <div className="text-center hidden md:block">
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">Δ</p>
            <p className="text-[11px] num text-blue-400">{n2(delta)}</p>
          </div>
        )}
        {theta != null && (
          <div className="text-center hidden lg:block">
            <p className="text-[8px] text-muted-foreground/60 uppercase tracking-wide">Θ</p>
            <p className="text-[11px] num text-red-400/70">{n2(theta)}</p>
          </div>
        )}
      </div>

      {/* Right: P&L */}
      <div className="text-right flex-shrink-0 ml-2">
        <div className={cn('text-base font-black num leading-none', openPct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
          {pct(openPct)}
        </div>
        <div className="text-[9px] text-muted-foreground/60 num mt-0.5">
          +{pct(highPct)} high
        </div>
      </div>

      {/* Expiry urgency */}
      {dte != null && dte <= 7 && (
        <div className={cn('ml-2 text-[9px] font-bold num flex-shrink-0', dte <= 2 ? 'text-red-500' : 'text-amber-500')}>
          {dte === 0 ? 'EXP' : `${dte}D`}
        </div>
      )}
    </div>
  )
}

/* ─── Exported component ─────────────────────────────────────────────────── */

export function OptionsContractCard({ trade, compact = false, monitorHref, className }: OptionsContractCardProps) {
  if (compact) {
    return <CompactCard trade={trade} monitorHref={monitorHref} className={className} />
  }
  return <FullCard trade={trade} monitorHref={monitorHref} className={className} />
}

/* ─── Options Chain Table ────────────────────────────────────────────────── */

interface OptionsChainTableProps {
  trades: OptionsContractData[]
  emptyMessage?: string
  /** Show link column to monitor page */
  showActions?: boolean
  className?: string
}

export function OptionsChainTable({ trades, emptyMessage = 'No options positions', showActions = false, className }: OptionsChainTableProps) {
  if (trades.length === 0) {
    return (
      <div className={cn('px-4 py-8 text-center text-xs text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-xs opt-chain-table">
        <thead>
          <tr>
            <th className="text-left">TYPE</th>
            <th className="text-left">SYMBOL</th>
            <th className="text-right">STRIKE</th>
            <th className="text-right">EXPIRY</th>
            <th className="text-right">DTE</th>
            <th className="text-right">ENTRY $</th>
            <th className="text-right">HIGH $</th>
            <th className="text-right">CURR $</th>
            <th className="text-right">IV</th>
            <th className="text-right">Δ DELTA</th>
            <th className="text-right">Θ THETA</th>
            <th className="text-right font-black">P&L %</th>
            {showActions && <th className="text-right">—</th>}
          </tr>
        </thead>
        <tbody>
          {trades.map(trade => {
            const { entry, current, high, openPct, highPct } = computePnL(trade)
            const snap = trade.entry_contract_snapshot
            const iv = snap?.implied_volatility
            const delta = snap?.delta
            const theta = snap?.theta
            const dte = daysToExpiry(trade.expiry)
            const isCall = trade.option_type === 'call' || trade.direction === 'call' || trade.direction === 'long'
            const pnlColor = openPct >= 2 ? 'text-emerald-500' : openPct <= -2 ? 'text-red-500' : 'text-amber-500/80'

            return (
              <tr key={trade.id} className={cn(
                'opt-chain-row',
                openPct >= 5 ? 'opt-chain-row-profit' : openPct <= -5 ? 'opt-chain-row-loss' : '',
              )}>
                {/* Type */}
                <td className="py-2 pl-3 pr-2">
                  <span className={cn('opt-dir-badge-sm', isCall ? 'opt-dir-call' : 'opt-dir-put')}>
                    {isCall ? 'CALL' : 'PUT'}
                  </span>
                </td>

                {/* Symbol + ticker */}
                <td className="py-2 px-2">
                  <div className="font-black text-foreground leading-none">{trade.underlying_index_symbol}</div>
                  {trade.polygon_option_ticker && (
                    <div className="opt-ticker-text leading-none mt-0.5">{trade.polygon_option_ticker}</div>
                  )}
                </td>

                {/* Strike */}
                <td className="py-2 px-2 text-right">
                  <span className="num font-bold text-foreground">
                    {trade.strike ? `$${trade.strike.toLocaleString()}` : '—'}
                  </span>
                </td>

                {/* Expiry */}
                <td className="py-2 px-2 text-right">
                  <span className="num text-muted-foreground text-[10px]">
                    {fmtExpiry(trade.expiry, true)}
                  </span>
                </td>

                {/* DTE */}
                <td className="py-2 px-2 text-right">
                  {dte != null ? (
                    <span className={cn('num font-bold text-[10px]',
                      dte <= 2 ? 'text-red-500' : dte <= 7 ? 'text-amber-500' : 'text-muted-foreground'
                    )}>
                      {dte > 0 ? `${dte}d` : dte === 0 ? 'EXP' : '—'}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>

                {/* Entry */}
                <td className="py-2 px-2 text-right">
                  <span className="num text-muted-foreground">${n2(entry)}</span>
                </td>

                {/* High */}
                <td className="py-2 px-2 text-right">
                  <div className="num text-emerald-500/80 leading-none">${n2(high)}</div>
                  <div className="text-[9px] num text-emerald-500/50 leading-none">+{n1(highPct)}%</div>
                </td>

                {/* Current */}
                <td className="py-2 px-2 text-right">
                  <span className={cn('num font-semibold', current > entry ? 'text-emerald-500' : current < entry ? 'text-red-500' : 'text-foreground')}>
                    ${n2(current)}
                  </span>
                </td>

                {/* IV */}
                <td className="py-2 px-2 text-right">
                  {iv != null ? (
                    <span className={cn('num text-[10px]', iv > 0.4 ? 'text-amber-500' : 'text-muted-foreground')}>
                      {(iv * 100).toFixed(1)}%
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>

                {/* Delta */}
                <td className="py-2 px-2 text-right">
                  {delta != null ? (
                    <span className={cn('num text-[10px]', Math.abs(delta) > 0.5 ? 'text-blue-400' : 'text-muted-foreground')}>
                      {n2(delta)}
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>

                {/* Theta */}
                <td className="py-2 px-2 text-right">
                  {theta != null ? (
                    <span className="num text-[10px] text-red-400/70">{n2(theta)}</span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>

                {/* P&L % — most important column */}
                <td className="py-2 pl-2 pr-3 text-right">
                  <div className={cn('num font-black text-sm leading-none', pnlColor)}>
                    {pct(openPct)}
                  </div>
                  <div className="mt-0.5 h-0.5 w-full">
                    <div
                      className={cn('h-full', openPct >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50')}
                      style={{ width: `${Math.min(Math.abs(openPct) / 2, 100)}%`, marginLeft: openPct >= 0 ? 0 : 'auto' }}
                    />
                  </div>
                </td>

                {/* Actions */}
                {showActions && (
                  <td className="py-2 pl-2 pr-3 text-right">
                    {trade.status === 'active' && (
                      <Link
                        href={`/dashboard/indices?trade=${trade.id}`}
                        className="text-[9px] text-primary hover:underline font-semibold"
                      >
                        MONITOR
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
