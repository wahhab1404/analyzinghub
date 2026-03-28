'use client'

/**
 * components/spx/SignalFeedPanel.tsx
 *
 * Signal Feed tab: chronological feed of all generated signal events,
 * loaded from the spx_signal_events table.
 */

import { useState, useEffect } from 'react'
import { Activity, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'
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

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  BUY_CALL:           'text-emerald-400',
  BUY_PUT:            'text-red-400',
  WATCH_CALL:         'text-blue-400',
  WATCH_PUT:          'text-blue-400',
  NO_TRADE:           'text-slate-600',
  MARKET_UNCLEAR:     'text-slate-500',
  WALL_SHIFT_WARNING: 'text-amber-400',
  FLOW_SURGE_WARNING: 'text-violet-400',
  SHOCK_WARNING:      'text-orange-400',
  REVERSAL_WATCH:     'text-amber-400',
}

function ResolutionBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null
  const cfg = {
    tp_hit:    { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'TP Hit', icon: CheckCircle },
    sl_hit:    { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     label: 'SL Hit', icon: XCircle },
    expired:   { color: 'text-slate-500',   bg: 'bg-slate-500/5',    border: 'border-slate-500/15',   label: 'Expired', icon: Clock },
    cancelled: { color: 'text-slate-600',   bg: 'bg-slate-500/5',    border: 'border-slate-500/15',   label: 'Cancelled', icon: XCircle },
  }[outcome] ?? { color: 'text-slate-500', bg: 'bg-slate-500/5', border: 'border-slate-500/15', label: outcome, icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={`flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  )
}

export function SignalFeedPanel({ className = '' }: { className?: string }) {
  const [events, setEvents] = useState<SignalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fullSignal, setFullSignal] = useState<SignalOutput | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)

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

  async function loadFullSignal(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setFullSignal(null)
      return
    }
    setExpandedId(id)
    setLoadingFull(true)
    // We don't have a per-signal endpoint — reconstruct from current result's signal
    // For historical signals we'll use the minimal data we have
    setLoadingFull(false)
  }

  useEffect(() => { loadFeed() }, [])

  const tradeSignals = events.filter(e => ['BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT'].includes(e.signal_type))
  const warnSignals  = events.filter(e => ['SHOCK_WARNING', 'WALL_SHIFT_WARNING', 'FLOW_SURGE_WARNING', 'REVERSAL_WATCH'].includes(e.signal_type))
  const otherSignals = events.filter(e => !tradeSignals.includes(e) && !warnSignals.includes(e))

  const tabs = [
    { key: 'all',    label: 'All',      count: events.length },
    { key: 'trade',  label: 'Signals',  count: tradeSignals.length },
    { key: 'warn',   label: 'Warnings', count: warnSignals.length },
  ]
  const [activeTab, setActiveTab] = useState('all')

  const displayEvents =
    activeTab === 'trade' ? tradeSignals :
    activeTab === 'warn'  ? warnSignals  :
    events

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Signal Feed</span>
        </div>
        <button
          onClick={loadFeed}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1a2840] pb-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-[10px] px-3 py-1 rounded transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                : 'text-slate-600 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[9px] text-slate-600">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <Activity className="w-5 h-5 text-blue-400 animate-spin" />
        </div>
      )}

      {!loading && displayEvents.length === 0 && (
        <div className="text-[11px] text-slate-600 text-center py-10">
          No signal events yet. Run the engine to generate signals.
        </div>
      )}

      <div className="space-y-2">
        {displayEvents.map(event => {
          const color = SIGNAL_TYPE_COLORS[event.signal_type] ?? 'text-slate-400'
          const isExpired = event.expires_at ? new Date(event.expires_at) < new Date() : false

          return (
            <div key={event.id}>
              <button
                onClick={() => loadFullSignal(event.id)}
                className="w-full text-left"
              >
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                  expandedId === event.id
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-[#1a2840] bg-[#0d1726] hover:border-[#243554]'
                }`}>
                  {/* Signal type */}
                  <div className="flex-shrink-0 w-32">
                    <div className={`text-[10px] font-bold ${color}`}>
                      {event.signal_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[9px] text-slate-600">{event.signal_mode.replace(/_/g, ' ')}</div>
                  </div>

                  {/* Price + score */}
                  <div className="flex-shrink-0">
                    <div className="text-[11px] text-white tabular-nums font-semibold">
                      {event.underlying_price.toFixed(0)}
                    </div>
                    <div className="text-[9px] text-slate-600 tabular-nums">
                      Score: <span className="text-slate-400">{event.composite_score}</span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  {event.recommended_strike && (
                    <div className="flex-shrink-0">
                      <div className={`text-[10px] font-semibold tabular-nums ${color}`}>
                        {event.recommended_option_type?.toUpperCase()} {event.recommended_strike}
                      </div>
                      <div className="text-[9px] text-slate-600">{event.recommended_expiry}</div>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="flex items-center gap-1 ml-auto flex-shrink-0 flex-wrap justify-end">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded bg-[#1a2840] text-slate-400`}>
                      {event.confidence_class}
                    </span>
                    {isExpired && !event.resolved_at && (
                      <span className="text-[9px] text-slate-600 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        Exp
                      </span>
                    )}
                    <ResolutionBadge outcome={event.resolution_outcome} />
                    <span className="text-[9px] text-slate-600">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded rationale */}
              {expandedId === event.id && event.rationale && (
                <div className="mx-3 mb-1 text-[10px] text-slate-500 bg-[#070e1a] border border-[#1a2840] border-t-0 rounded-b-lg px-3 py-2">
                  {event.rationale}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
