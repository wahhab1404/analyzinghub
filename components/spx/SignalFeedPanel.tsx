'use client'

import { useState, useEffect } from 'react'
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, Radio,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { SignalType, ConfidenceClass } from '@/services/spx/types'
import { formatDistanceToNow, format } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────

interface SignalEvent {
  id: string
  created_at: string
  signal_type: SignalType
  signal_mode: string
  direction_bias: string
  market_mode: string
  underlying_price: number
  composite_score: number
  confidence_class: ConfidenceClass
  recommended_strike: number | null
  recommended_expiry: string | null
  recommended_option_type: string | null
  rationale: string | null
  expires_at: string | null
  resolved_at: string | null
  resolution_outcome: string | null
}

// ── Config maps ───────────────────────────────────────────────────────────────

const SIGNAL_TYPE_CFG: Record<string, {
  label: string
  text: string
  dot: string
  rowBg: string
  rowBorder: string
  expandBg: string
  expandBorder: string
}> = {
  BUY_CALL:           { label: 'BUY CALL',    text: 'text-emerald-400', dot: 'bg-emerald-400',  rowBg: 'bg-emerald-500/[0.04]', rowBorder: 'border-emerald-500/20', expandBg: 'bg-emerald-500/[0.03]', expandBorder: 'border-emerald-500/15' },
  BUY_PUT:            { label: 'BUY PUT',     text: 'text-red-400',     dot: 'bg-red-400',      rowBg: 'bg-red-500/[0.04]',     rowBorder: 'border-red-500/20',     expandBg: 'bg-red-500/[0.03]',     expandBorder: 'border-red-500/15' },
  WATCH_CALL:         { label: 'WATCH CALL',  text: 'text-blue-400',    dot: 'bg-blue-400',     rowBg: 'bg-blue-500/[0.03]',    rowBorder: 'border-blue-500/20',    expandBg: 'bg-blue-500/[0.02]',    expandBorder: 'border-blue-500/15' },
  WATCH_PUT:          { label: 'WATCH PUT',   text: 'text-blue-400',    dot: 'bg-blue-400',     rowBg: 'bg-blue-500/[0.03]',    rowBorder: 'border-blue-500/20',    expandBg: 'bg-blue-500/[0.02]',    expandBorder: 'border-blue-500/15' },
  NO_TRADE:           { label: 'NO TRADE',    text: 'text-slate-500',   dot: 'bg-slate-600',    rowBg: 'bg-white/[0.02]',       rowBorder: 'border-white/[0.06]',   expandBg: 'bg-white/[0.01]',       expandBorder: 'border-white/[0.05]' },
  MARKET_UNCLEAR:     { label: 'UNCLEAR',     text: 'text-slate-400',   dot: 'bg-slate-500',    rowBg: 'bg-white/[0.02]',       rowBorder: 'border-white/[0.06]',   expandBg: 'bg-white/[0.01]',       expandBorder: 'border-white/[0.05]' },
  WALL_SHIFT_WARNING: { label: 'WALL SHIFT',  text: 'text-amber-400',   dot: 'bg-amber-400',    rowBg: 'bg-amber-500/[0.04]',   rowBorder: 'border-amber-500/20',   expandBg: 'bg-amber-500/[0.03]',   expandBorder: 'border-amber-500/15' },
  FLOW_SURGE_WARNING: { label: 'FLOW SURGE',  text: 'text-violet-400',  dot: 'bg-violet-400',   rowBg: 'bg-violet-500/[0.04]',  rowBorder: 'border-violet-500/20',  expandBg: 'bg-violet-500/[0.03]',  expandBorder: 'border-violet-500/15' },
  SHOCK_WARNING:      { label: 'SHOCK',       text: 'text-orange-400',  dot: 'bg-orange-400',   rowBg: 'bg-orange-500/[0.04]',  rowBorder: 'border-orange-500/20',  expandBg: 'bg-orange-500/[0.03]',  expandBorder: 'border-orange-500/15' },
  REVERSAL_WATCH:     { label: 'REVERSAL',    text: 'text-amber-400',   dot: 'bg-amber-400',    rowBg: 'bg-amber-500/[0.04]',   rowBorder: 'border-amber-500/20',   expandBg: 'bg-amber-500/[0.03]',   expandBorder: 'border-amber-500/15' },
}

const CONFIDENCE_CFG: Record<ConfidenceClass, { cls: string; label: string; score: [number, number] }> = {
  A: { cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', label: 'A — High',    score: [80, 100] },
  B: { cls: 'text-blue-400   bg-blue-500/15   border-blue-500/30',   label: 'B — Good',    score: [65, 79]  },
  C: { cls: 'text-amber-400  bg-amber-500/15  border-amber-500/30',  label: 'C — Fair',    score: [50, 64]  },
  D: { cls: 'text-orange-400 bg-orange-500/15 border-orange-500/30', label: 'D — Weak',    score: [35, 49]  },
  E: { cls: 'text-red-400    bg-red-500/15    border-red-500/30',    label: 'E — Low',     score: [0, 34]   },
}

const BIAS_CFG: Record<string, { cls: string; icon: React.ElementType; label: string }> = {
  bullish: { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: TrendingUp,   label: 'Bullish' },
  bearish: { cls: 'text-red-400     bg-red-500/10     border-red-500/20',     icon: TrendingDown, label: 'Bearish' },
  neutral: { cls: 'text-slate-400   bg-slate-500/10   border-slate-500/20',   icon: Minus,        label: 'Neutral' },
}

const RESOLUTION_CFG: Record<string, { cls: string; label: string; icon: React.ElementType }> = {
  tp_hit:    { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'TP Hit',    icon: CheckCircle },
  sl_hit:    { cls: 'text-red-400     bg-red-500/10     border-red-500/20',     label: 'SL Hit',    icon: XCircle },
  expired:   { cls: 'text-slate-500   bg-white/5        border-white/10',       label: 'Expired',   icon: Clock },
  cancelled: { cls: 'text-slate-500   bg-white/5        border-white/10',       label: 'Cancelled', icon: XCircle },
}

const MODE_LABELS: Record<string, string> = {
  Trend:                    'Trend',
  Trend_Acceleration:       'Trend Accel',
  Breakout:                 'Breakout',
  Breakdown:                'Breakdown',
  Reversal:                 'Reversal',
  Mean_Reversion:           'Mean Reversion',
  Momentum_Shock:           'Momentum Shock',
  Flow_Expansion:           'Flow Expansion',
  Liquidity_Sweep_Recovery: 'Sweep Recovery',
  Wall_Rejection:           'Wall Rejection',
  Wall_Break_Continuation:  'Wall Break',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 75) return { text: 'text-emerald-400', bar: 'bg-emerald-500', track: 'bg-emerald-500/10' }
  if (s >= 60) return { text: 'text-blue-400',    bar: 'bg-blue-500',    track: 'bg-blue-500/10' }
  if (s >= 45) return { text: 'text-amber-400',   bar: 'bg-amber-500',   track: 'bg-amber-500/10' }
  if (s >= 30) return { text: 'text-orange-400',  bar: 'bg-orange-500',  track: 'bg-orange-500/10' }
  return            { text: 'text-red-400',        bar: 'bg-red-500',     track: 'bg-red-500/10' }
}

/**
 * Parses rationale built by signal-scorer:
 * "TYPE | Mode | Composite Xpt structure+flow. BIAS bias with factor1; factor2."
 */
function parseRationale(raw: string | null) {
  if (!raw) return { compositeNote: null, biasNote: null, factors: [] as string[] }

  const parts = raw.split(' | ')
  const detail = parts.length >= 3 ? parts.slice(2).join(' | ') : raw

  // Split at first ". " to separate composite note from bias/factor note
  const dotIdx = detail.indexOf('. ')
  const compositeNote = dotIdx > -1 ? detail.slice(0, dotIdx) : null
  const rest = dotIdx > -1 ? detail.slice(dotIdx + 2) : detail

  // Extract individual factors from "BIAS bias with factor1; factor2."
  const withIdx = rest.indexOf(' with ')
  const biasNote = withIdx > -1 ? rest.slice(0, withIdx).trim() : rest.replace(/\.$/, '').trim()
  const factorStr = withIdx > -1 ? rest.slice(withIdx + 6).replace(/\.$/, '') : ''
  const factors = factorStr ? factorStr.split('; ').filter(Boolean) : []

  return { compositeNote, biasNote, factors }
}

function fmt(price: number) {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreMini({ score }: { score: number }) {
  const c = scoreColor(score)
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <span className={`text-sm font-bold tabular-nums w-6 text-right ${c.text}`}>{score}</span>
      <div className={`flex-1 h-1.5 rounded-full ${c.track}`}>
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function BiasBadge({ bias }: { bias: string }) {
  const cfg = BIAS_CFG[bias?.toLowerCase()] ?? BIAS_CFG.neutral
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function ConfidenceBadge({ cls }: { cls: ConfidenceClass }) {
  const cfg = CONFIDENCE_CFG[cls] ?? CONFIDENCE_CFG.E
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function ResolutionBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  const cfg = RESOLUTION_CFG[outcome] ?? { cls: 'text-slate-500 bg-white/5 border-white/10', label: outcome, icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

// ── Signal Row ────────────────────────────────────────────────────────────────

function SignalRow({ event }: { event: SignalEvent }) {
  const [open, setOpen] = useState(false)

  const cfg        = SIGNAL_TYPE_CFG[event.signal_type] ?? SIGNAL_TYPE_CFG.MARKET_UNCLEAR
  const confCfg    = CONFIDENCE_CFG[event.confidence_class] ?? CONFIDENCE_CFG.E
  const sc         = scoreColor(event.composite_score)
  const parsed     = parseRationale(event.rationale)
  const isExpired  = event.expires_at ? new Date(event.expires_at) < new Date() : false
  const isActionable = ['BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT'].includes(event.signal_type)
  const modeLabel  = MODE_LABELS[event.signal_mode] ?? event.signal_mode.replace(/_/g, ' ')

  return (
    <div className="rounded-xl overflow-hidden">
      {/* ── Collapsed row ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left"
      >
        <div className={`border transition-colors ${
          open
            ? `${cfg.rowBorder} ${cfg.rowBg} rounded-t-xl`
            : `border-white/[0.07] bg-[#0b1525] rounded-xl hover:border-white/[0.13] hover:bg-[#0d1830]`
        }`}>

          {/* ── Main row ── */}
          <div className="flex items-center gap-3 px-4 py-3">

            {/* Signal type */}
            <div className="flex items-center gap-2 flex-shrink-0 min-w-[120px]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${isActionable ? 'animate-pulse' : ''}`} />
              <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
            </div>

            {/* Price */}
            <div className="flex-shrink-0 hidden sm:block">
              <div className="text-[10px] text-slate-600 uppercase tracking-widest font-medium">SPX</div>
              <div className="text-sm font-bold text-white tabular-nums">{fmt(event.underlying_price)}</div>
            </div>

            {/* Score mini bar */}
            <div className="flex-shrink-0 hidden sm:block">
              <div className="text-[10px] text-slate-600 uppercase tracking-widest font-medium mb-1">Score</div>
              <ScoreMini score={event.composite_score} />
            </div>

            {/* Mobile: price + score inline */}
            <div className="sm:hidden flex items-center gap-2 text-xs">
              <span className="text-slate-400 tabular-nums font-semibold">{fmt(event.underlying_price)}</span>
              <span className={`font-bold ${sc.text}`}>{event.composite_score}</span>
            </div>

            {/* Badges: right-aligned */}
            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              <BiasBadge bias={event.direction_bias} />
              <ConfidenceBadge cls={event.confidence_class} />
              {event.resolution_outcome
                ? <ResolutionBadge outcome={event.resolution_outcome} />
                : isExpired && !event.resolved_at
                  ? <span className="text-[10px] text-slate-600 flex items-center gap-0.5"><Clock className="w-3 h-3" />Exp</span>
                  : null
              }
              <span className="text-[10px] text-slate-600 hidden md:inline whitespace-nowrap">
                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
              </span>
              {open
                ? <ChevronUp   className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                : <ChevronDown className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              }
            </div>
          </div>

          {/* ── Sub-row: mode · market · contract ── */}
          <div className="flex items-center gap-3 px-4 pb-2.5 flex-wrap">
            <span className="text-[10px] text-slate-500 font-medium">{modeLabel}</span>
            <span className="text-slate-700 text-[10px]">·</span>
            <span className="text-[10px] text-slate-600">{event.market_mode}</span>
            {event.recommended_strike && (
              <>
                <span className="text-slate-700 text-[10px]">·</span>
                <span className={`text-[10px] font-bold tabular-nums ${cfg.text}`}>
                  {event.recommended_option_type?.toUpperCase()} {event.recommended_strike}
                  {event.recommended_expiry && <span className="text-slate-600 font-normal ml-1">{event.recommended_expiry}</span>}
                </span>
              </>
            )}
            <span className="text-[10px] text-slate-600 md:hidden ml-auto">
              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
      </button>

      {/* ── Expanded rationale panel ── */}
      {open && (
        <div className={`border border-t-0 rounded-b-xl px-4 py-4 space-y-3 ${cfg.expandBorder} ${cfg.expandBg}`}>

          {/* Header row in expanded */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Signal Details</div>
              <div className="text-xs text-slate-400">
                {format(new Date(event.created_at), 'MMM d, yyyy · HH:mm:ss')}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Score gauge inline */}
              <div className="text-center">
                <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Score</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold tabular-nums ${sc.text}`}>{event.composite_score}</span>
                  <span className="text-xs text-slate-600">/ 100</span>
                </div>
                <div className="w-24 h-1.5 bg-white/[0.06] rounded-full mt-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${sc.bar}`} style={{ width: `${event.composite_score}%` }} />
                </div>
              </div>
              <div className="w-px h-10 bg-white/[0.06]" />
              <div className="text-center">
                <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Confidence</div>
                <span className={`text-sm font-bold px-2 py-1 rounded-lg border ${confCfg.cls}`}>
                  {confCfg.label}
                </span>
              </div>
            </div>
          </div>

          {/* Grid: key facts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Fact label="Direction"  value={<BiasBadge bias={event.direction_bias} />} />
            <Fact label="Mode"       value={<span className="text-xs text-slate-300 font-semibold">{modeLabel}</span>} />
            <Fact label="Market"     value={<span className="text-xs text-slate-300 font-semibold">{event.market_mode}</span>} />
            <Fact label="SPX Price"  value={<span className="text-xs text-white font-bold tabular-nums">{fmt(event.underlying_price)}</span>} />
          </div>

          {/* Contract if available */}
          {event.recommended_strike && (
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${cfg.rowBorder} ${cfg.rowBg}`}>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex-shrink-0">Contract</span>
              <span className={`text-sm font-bold tabular-nums ${cfg.text}`}>
                {event.recommended_option_type?.toUpperCase()} {event.recommended_strike}
              </span>
              {event.recommended_expiry && (
                <span className="text-xs text-slate-500">Exp: {event.recommended_expiry}</span>
              )}
            </div>
          )}

          {/* Parsed rationale */}
          {(parsed.compositeNote || parsed.biasNote || parsed.factors.length > 0) && (
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Rationale</div>

              {parsed.compositeNote && (
                <div className="text-xs text-slate-500 bg-white/[0.03] rounded-lg px-3 py-2">
                  {parsed.compositeNote}
                </div>
              )}

              {parsed.biasNote && (
                <div className="text-xs text-slate-400">{parsed.biasNote}</div>
              )}

              {parsed.factors.length > 0 && (
                <ul className="space-y-1.5">
                  {parsed.factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-snug">
                      <span className={`mt-0.5 flex-shrink-0 ${cfg.text} opacity-60`}>▸</span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Resolution */}
          {event.resolution_outcome && (
            <div className="border-t border-white/[0.06] pt-3 flex items-center gap-2">
              <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">Resolution</span>
              <ResolutionBadge outcome={event.resolution_outcome} />
              {event.resolved_at && (
                <span className="text-[10px] text-slate-600 ml-auto">
                  {format(new Date(event.resolved_at), 'HH:mm:ss')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] rounded-xl px-3 py-2">
      <div className="text-[10px] text-slate-600 uppercase tracking-widest font-medium mb-1">{label}</div>
      {value}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function SignalFeedPanel({ className = '' }: { className?: string }) {
  const [events, setEvents]       = useState<SignalEvent[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')

  async function loadFeed() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/spx/signal?skipWalls=true&skipContracts=true&history=50')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Feed load failed')
      setEvents(data.signalHistory ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFeed() }, [])

  const tradeEvents = events.filter(e => ['BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT'].includes(e.signal_type))
  const warnEvents  = events.filter(e => ['SHOCK_WARNING', 'WALL_SHIFT_WARNING', 'FLOW_SURGE_WARNING', 'REVERSAL_WATCH'].includes(e.signal_type))
  const noTradeEvents = events.filter(e => ['NO_TRADE', 'MARKET_UNCLEAR'].includes(e.signal_type))

  const tabs = [
    { key: 'all',     label: 'All',        count: events.length },
    { key: 'trade',   label: 'Actionable', count: tradeEvents.length },
    { key: 'warn',    label: 'Warnings',   count: warnEvents.length },
    { key: 'notrade', label: 'No Trade',   count: noTradeEvents.length },
  ]

  const displayEvents =
    activeTab === 'trade'   ? tradeEvents   :
    activeTab === 'warn'    ? warnEvents    :
    activeTab === 'notrade' ? noTradeEvents :
    events

  return (
    <div className={`space-y-4 max-w-4xl ${className}`}>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">Signal Feed</span>
          {!loading && events.length > 0 && (
            <span className="text-xs text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {events.length} events
            </span>
          )}
        </div>
        <button
          onClick={loadFeed}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-600">
        {Object.entries(CONFIDENCE_CFG).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded-full border font-semibold ${v.cls}`}>
            {v.label} ({v.score[0]}–{v.score[1]})
          </span>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === tab.key
                ? 'bg-amber-500/15 text-amber-400 border border-amber-400/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-14">
          <div className="space-y-3 text-center">
            <Activity className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
            <div className="text-sm text-slate-500">Loading signals…</div>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && displayEvents.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-14 bg-white/[0.02] rounded-2xl border border-white/[0.06]">
          No signal events in this category yet.
        </div>
      )}

      {/* Feed */}
      {!loading && displayEvents.length > 0 && (
        <div className="space-y-2">
          {displayEvents.map(event => (
            <SignalRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
