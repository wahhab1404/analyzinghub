'use client'

/**
 * components/spx/ActiveTradesPanel.tsx
 *
 * Trades tab: shows active SPX trade positions with real-time P/L,
 * risk levels, MFE/MAE, signal metadata, and a compact recent closed trades section.
 * Auto-refreshes every 30 seconds via GET /api/spx/trades.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Clock, AlertCircle, Activity } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SPXTrade {
  id: string
  state: string
  ticker: string
  strike: number
  expiry: string
  optionType: string
  dte: number
  entryPremium: number | null
  currentPremium: number | null
  highestPremium: number | null
  lowestPremium: number | null
  stopPremium: number | null
  target1Premium: number | null
  target2Premium: number | null
  target3Premium: number | null
  unrealizedPnlPct: number | null
  realizedPnlPct: number | null
  mfe: number | null
  mae: number | null
  compositeScore: number | null
  confidenceClass: string | null
  signalMode: string | null
  directionBias: string | null
  entrySpxPrice: number | null
  currentSpxPrice: number | null
  exitReason: string | null
  finalScoreOutcome: string | null
  exitPremium: number | null
  time_stop_at?: string | null
}

interface TradesApiResponse {
  active: SPXTrade[]
  recent: SPXTrade[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return `$${v.toFixed(decimals)}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function pnlClass(v: number | null | undefined): string {
  if (v == null) return 'text-slate-500'
  if (v > 0) return 'text-green-400'
  if (v < 0) return 'text-red-400'
  return 'text-slate-400'
}

function formatTimeStop(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

// ── State badge ───────────────────────────────────────────────────────────────

function stateBadgeClass(state: string): string {
  switch (state) {
    case 'detected':
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    case 'candidate':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    case 'confirmed':
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    case 'alerted':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    case 'entered':
    case 'active':
      return 'text-green-400 bg-green-500/10 border-green-500/20'
    case 'partially_exited':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'closed_win':
      return 'text-green-300 bg-green-500/15 border-green-400/30'
    case 'closed_loss':
      return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'expired':
    case 'invalidated':
    case 'cancelled':
      return 'text-gray-500 bg-gray-500/10 border-gray-500/20'
    default:
      return 'text-slate-500 bg-slate-500/5 border-slate-500/10'
  }
}

// ── Outcome badge ─────────────────────────────────────────────────────────────

function outcomeBadgeClass(outcome: string | null): string {
  switch (outcome) {
    case 'big_win':    return 'text-green-400 bg-green-500/10 border-green-500/20'
    case 'small_win':  return 'text-lime-400 bg-lime-500/10 border-lime-500/20'
    case 'breakeven':  return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    case 'small_loss': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    case 'big_loss':   return 'text-red-400 bg-red-500/10 border-red-500/20'
    default:           return 'text-slate-500 bg-slate-500/5 border-slate-500/10'
  }
}

// ── Direction badge ───────────────────────────────────────────────────────────

function DirectionBadge({ bias, optionType }: { bias: string | null; optionType: string }) {
  const isCall = optionType?.toLowerCase() === 'call'
  const isBull = bias === 'bullish' || (bias == null && isCall)
  const label  = bias ?? optionType ?? '—'
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
      isBull
        ? 'text-green-400 bg-green-500/10 border-green-500/20'
        : 'text-red-400 bg-red-500/10 border-red-500/20'
    }`}>
      {isBull ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {label}
    </span>
  )
}

// ── Active Trade Card ─────────────────────────────────────────────────────────

function ActiveTradeCard({ trade }: { trade: SPXTrade }) {
  const hasEntry = trade.entryPremium !== null

  return (
    <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4 space-y-3">
      {/* Top row: ticker, state badge, direction */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm font-bold text-white tracking-wide">{trade.ticker}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${stateBadgeClass(trade.state)}`}>
          {trade.state.replace(/_/g, ' ')}
        </span>
        <DirectionBadge bias={trade.directionBias} optionType={trade.optionType} />
        {trade.dte != null && (
          <span className="text-[9px] text-slate-600 ml-auto">DTE: {trade.dte}</span>
        )}
      </div>

      {/* Price row: Entry → Current with P/L % */}
      <div className="flex items-center gap-3 text-[11px]">
        {hasEntry ? (
          <>
            <div>
              <span className="text-slate-600 mr-1">Entry</span>
              <span className="font-semibold text-slate-300 tabular-nums">{fmt(trade.entryPremium)}</span>
            </div>
            <span className="text-slate-700">→</span>
            <div>
              <span className="text-slate-600 mr-1">Current</span>
              <span className="font-semibold text-slate-200 tabular-nums">{fmt(trade.currentPremium)}</span>
            </div>
            {trade.unrealizedPnlPct != null && (
              <span className={`font-bold tabular-nums ${pnlClass(trade.unrealizedPnlPct)}`}>
                {fmtPct(trade.unrealizedPnlPct)}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-slate-600 italic">Not entered</span>
            {trade.currentPremium != null && (
              <div>
                <span className="text-slate-600 mr-1">Current</span>
                <span className="font-semibold text-slate-300 tabular-nums">{fmt(trade.currentPremium)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Premium extremes */}
      {(trade.highestPremium != null || trade.lowestPremium != null) && (
        <div className="text-[10px] text-slate-600">
          <span className="text-slate-500">High:</span>{' '}
          <span className="tabular-nums">{fmt(trade.highestPremium)}</span>
          <span className="mx-2 text-slate-700">|</span>
          <span className="text-slate-500">Low:</span>{' '}
          <span className="tabular-nums">{fmt(trade.lowestPremium)}</span>
        </div>
      )}

      {/* Risk levels: Stop, T1, T2, T3 */}
      {(trade.stopPremium != null ||
        trade.target1Premium != null ||
        trade.target2Premium != null ||
        trade.target3Premium != null) && (
        <div className="text-[10px] text-slate-600 flex flex-wrap gap-2">
          {trade.stopPremium != null && (
            <span>
              <span className="text-red-500/70">Stop:</span>{' '}
              <span className="tabular-nums text-slate-500">{fmt(trade.stopPremium)}</span>
            </span>
          )}
          {trade.target1Premium != null && (
            <span>
              <span className="text-slate-500">T1:</span>{' '}
              <span className="tabular-nums text-slate-400">{fmt(trade.target1Premium)}</span>
            </span>
          )}
          {trade.target2Premium != null && (
            <span>
              <span className="text-slate-500">T2:</span>{' '}
              <span className="tabular-nums text-slate-400">{fmt(trade.target2Premium)}</span>
            </span>
          )}
          {trade.target3Premium != null && (
            <span>
              <span className="text-slate-500">T3:</span>{' '}
              <span className="tabular-nums text-slate-400">{fmt(trade.target3Premium)}</span>
            </span>
          )}
        </div>
      )}

      {/* MFE / MAE */}
      {(trade.mfe != null || trade.mae != null) && (
        <div className="text-[10px] flex gap-3">
          {trade.mfe != null && (
            <span>
              <span className="text-slate-600">MFE: </span>
              <span className="text-green-400 tabular-nums font-semibold">+{trade.mfe.toFixed(1)}%</span>
            </span>
          )}
          {trade.mae != null && (
            <span>
              <span className="text-slate-600">MAE: </span>
              <span className="text-red-400 tabular-nums font-semibold">-{Math.abs(trade.mae).toFixed(1)}%</span>
            </span>
          )}
        </div>
      )}

      {/* Signal info: mode, confidence class, composite score */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {trade.signalMode && (
          <span className="text-slate-600">
            Mode: <span className="text-slate-400 font-semibold">{trade.signalMode.replace(/_/g, ' ')}</span>
          </span>
        )}
        {trade.confidenceClass && (
          <span className="text-slate-600">
            Conf:{' '}
            <span className={`font-bold ${
              trade.confidenceClass === 'A' ? 'text-green-400'  :
              trade.confidenceClass === 'B' ? 'text-blue-400'   :
              trade.confidenceClass === 'C' ? 'text-yellow-400' :
              trade.confidenceClass === 'D' ? 'text-orange-400' :
                                              'text-red-400'
            }`}>
              {trade.confidenceClass}
            </span>
          </span>
        )}
        {trade.compositeScore != null && (
          <span className="text-slate-600">
            Score: <span className="text-slate-300 font-semibold tabular-nums">{trade.compositeScore.toFixed(0)}</span>
          </span>
        )}
      </div>

      {/* Time stop */}
      {trade.time_stop_at && (
        <div className="flex items-center gap-1 text-[10px] text-amber-400/80">
          <Clock className="w-3 h-3" />
          <span>Time stop: {formatTimeStop(trade.time_stop_at)}</span>
        </div>
      )}
    </div>
  )
}

// ── Closed Trade Row ──────────────────────────────────────────────────────────

function ClosedTradeRow({ trade }: { trade: SPXTrade }) {
  const pnl = trade.realizedPnlPct
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#070e1a] border border-[#1a2840] rounded-lg text-[10px]">
      <span className="font-mono font-bold text-slate-300 min-w-[90px]">{trade.ticker}</span>
      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold uppercase tracking-wide ${outcomeBadgeClass(trade.finalScoreOutcome)}`}>
        {trade.finalScoreOutcome ? trade.finalScoreOutcome.replace(/_/g, ' ') : '—'}
      </span>
      <span className={`font-bold tabular-nums ${pnlClass(pnl)}`}>
        {pnl != null ? fmtPct(pnl) : '—'}
      </span>
      {trade.exitReason && (
        <span className="text-slate-600 ml-auto truncate max-w-[120px]">
          {trade.exitReason.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface ActiveTradesPanelProps {
  className?: string
}

export function ActiveTradesPanel({ className = '' }: ActiveTradesPanelProps) {
  const [data, setData]               = useState<TradesApiResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchTrades = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/spx/trades')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrades()
    const interval = setInterval(fetchTrades, 30_000)
    return () => clearInterval(interval)
  }, [fetchTrades])

  const activeTrades = data?.active ?? []
  const recentTrades = data?.recent ?? []

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className={`w-3.5 h-3.5 text-green-400 ${loading ? 'animate-pulse' : ''}`} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Active Trades
          </span>
          {activeTrades.length > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-green-400 bg-green-500/10 border-green-500/20">
              {activeTrades.length} open
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[9px] text-slate-600">{lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={fetchTrades}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {!data && loading && (
        <div className="flex items-center justify-center h-40">
          <div className="text-center space-y-2">
            <Activity className="w-6 h-6 text-green-400 animate-spin mx-auto" />
            <div className="text-[11px] text-slate-500">Loading trades…</div>
          </div>
        </div>
      )}

      {/* Active trades list */}
      {data && (
        <>
          {activeTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 bg-[#070e1a] border border-[#1a2840] rounded-xl">
              <TrendingUp className="w-8 h-8 text-slate-700 mb-1" />
              <div className="text-[13px] text-slate-400 font-semibold">No active trades</div>
              <div className="text-[10px] text-slate-600">
                Trades will appear here when the engine detects and enters positions.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTrades.map(trade => (
                <ActiveTradeCard key={trade.id} trade={trade} />
              ))}
            </div>
          )}

          {/* Recent closed trades */}
          {recentTrades.length > 0 && (
            <div className="space-y-2 border-t border-[#1a2840] pt-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                Recent Closed Trades
              </div>
              <div className="space-y-1.5">
                {recentTrades.slice(0, 5).map(trade => (
                  <ClosedTradeRow key={trade.id} trade={trade} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
