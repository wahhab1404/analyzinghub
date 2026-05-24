'use client'

import { useState, useEffect } from 'react'
import { Activity, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, Radio } from 'lucide-react'
import { SignalCard } from './SignalCard'
import type { SignalOutput, SignalType, ConfidenceClass } from '@/services/spx/types'
import { formatDistanceToNow } from 'date-fns'

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

const SIGNAL_TYPE_CONFIG: Record<string, { text: string; dot: string }> = {
  BUY_CALL:           { text: 'text-emerald-400', dot: 'bg-emerald-400' },
  BUY_PUT:            { text: 'text-red-400',     dot: 'bg-red-400' },
  WATCH_CALL:         { text: 'text-blue-400',    dot: 'bg-blue-400' },
  WATCH_PUT:          { text: 'text-blue-400',    dot: 'bg-blue-400' },
  NO_TRADE:           { text: 'text-slate-500',   dot: 'bg-slate-500' },
  MARKET_UNCLEAR:     { text: 'text-slate-400',   dot: 'bg-slate-400' },
  WALL_SHIFT_WARNING: { text: 'text-amber-400',   dot: 'bg-amber-400' },
  FLOW_SURGE_WARNING: { text: 'text-violet-400',  dot: 'bg-violet-400' },
  SHOCK_WARNING:      { text: 'text-orange-400',  dot: 'bg-orange-400' },
  REVERSAL_WATCH:     { text: 'text-amber-400',   dot: 'bg-amber-400' },
}

const CONFIDENCE_COLORS: Record<ConfidenceClass, string> = {
  A: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  B: 'text-blue-400   bg-blue-500/10   border-blue-500/25',
  C: 'text-amber-400  bg-amber-500/10  border-amber-500/25',
  D: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  E: 'text-red-400    bg-red-500/10    border-red-500/25',
}

function ResolutionBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  const cfg = {
    tp_hit:    { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: 'TP Hit',     icon: CheckCircle },
    sl_hit:    { cls: 'text-red-400     bg-red-500/10     border-red-500/20',     label: 'SL Hit',     icon: XCircle },
    expired:   { cls: 'text-slate-500   bg-white/5        border-white/10',       label: 'Expired',    icon: Clock },
    cancelled: { cls: 'text-slate-500   bg-white/5        border-white/10',       label: 'Cancelled',  icon: XCircle },
  }[outcome] ?? { cls: 'text-slate-500 bg-white/5 border-white/10', label: outcome, icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

export function SignalFeedPanel({ className = '' }: { className?: string }) {
  const [events, setEvents]         = useState<SignalEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState('all')

  async function loadFeed() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/spx/signal?skipWalls=true&skipContracts=true&history=50')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Feed load failed')
      setEvents(data.signalHistory ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  useEffect(() => { loadFeed() }, [])

  const tradeSignals = events.filter(e => ['BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT'].includes(e.signal_type))
  const warnSignals  = events.filter(e => ['SHOCK_WARNING', 'WALL_SHIFT_WARNING', 'FLOW_SURGE_WARNING', 'REVERSAL_WATCH'].includes(e.signal_type))

  const tabs = [
    { key: 'all',   label: 'All',      count: events.length },
    { key: 'trade', label: 'Signals',  count: tradeSignals.length },
    { key: 'warn',  label: 'Warnings', count: warnSignals.length },
  ]

  const displayEvents =
    activeTab === 'trade' ? tradeSignals :
    activeTab === 'warn'  ? warnSignals  :
    events

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-white">Signal Feed</span>
          {!loading && (
            <span className="text-xs text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {events.length} events
            </span>
          )}
        </div>
        <button
          onClick={loadFeed}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${
              activeTab === tab.key
                ? 'bg-amber-500/15 text-amber-400 border border-amber-400/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
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
          No signal events yet. Run the engine to generate signals.
        </div>
      )}

      {/* Feed list */}
      {!loading && (
        <div className="space-y-2">
          {displayEvents.map(event => {
            const cfg = SIGNAL_TYPE_CONFIG[event.signal_type] ?? { text: 'text-slate-400', dot: 'bg-slate-400' }
            const confidenceCls = CONFIDENCE_COLORS[event.confidence_class] ?? 'text-slate-500 bg-white/5 border-white/10'
            const isExpired = event.expires_at ? new Date(event.expires_at) < new Date() : false
            const isExpanded = expandedId === event.id

            return (
              <div key={event.id} className="rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(event.id)}
                  className="w-full text-left"
                >
                  <div className={`flex items-center gap-3 px-4 py-3.5 border transition-all ${
                    isExpanded
                      ? 'border-amber-500/25 bg-amber-500/5 rounded-t-xl'
                      : 'border-white/[0.07] bg-[#0b1525] rounded-xl hover:border-white/15 hover:bg-[#0d1830]'
                  }`}>
                    {/* Dot + type */}
                    <div className="flex-shrink-0 min-w-[130px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <span className={`text-xs font-bold ${cfg.text}`}>
                          {event.signal_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5 pl-4">
                        {event.signal_mode.replace(/_/g, ' ')}
                      </div>
                    </div>

                    {/* Price + score */}
                    <div className="flex-shrink-0">
                      <div className="text-sm font-bold text-white tabular-nums">
                        {event.underlying_price.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-slate-600 tabular-nums">
                        Score <span className="text-slate-400 font-semibold">{event.composite_score}</span>
                      </div>
                    </div>

                    {/* Recommendation */}
                    {event.recommended_strike && (
                      <div className="flex-shrink-0 hidden sm:block">
                        <div className={`text-xs font-bold tabular-nums ${cfg.text}`}>
                          {event.recommended_option_type?.toUpperCase()} {event.recommended_strike}
                        </div>
                        <div className="text-[10px] text-slate-600">{event.recommended_expiry}</div>
                      </div>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 ml-auto flex-shrink-0 flex-wrap justify-end">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${confidenceCls}`}>
                        {event.confidence_class}
                      </span>
                      {isExpired && !event.resolved_at && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          Exp
                        </span>
                      )}
                      <ResolutionBadge outcome={event.resolution_outcome} />
                      <span className="text-[10px] text-slate-600 hidden sm:inline">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expanded rationale */}
                {isExpanded && event.rationale && (
                  <div className="px-4 py-3 text-xs text-slate-400 leading-relaxed bg-[#070f1c] border border-t-0 border-amber-500/15 rounded-b-xl">
                    {event.rationale}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
