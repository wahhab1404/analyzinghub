'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Clock, AlertCircle, Activity, Target, PauseCircle, Loader2 } from 'lucide-react'

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

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return `$${v.toFixed(decimals)}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

function pnlColorClass(v: number | null | undefined): string {
  if (v == null) return 'text-slate-500'
  if (v > 5)  return 'text-emerald-400'
  if (v > 0)  return 'text-green-400'
  if (v < -5) return 'text-red-400'
  if (v < 0)  return 'text-orange-400'
  return 'text-slate-400'
}

function formatTimeStop(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

const STATE_BADGE: Record<string, string> = {
  detected:         'text-slate-400   bg-slate-500/10   border-slate-500/20',
  candidate:        'text-blue-400    bg-blue-500/10    border-blue-500/20',
  confirmed:        'text-yellow-400  bg-yellow-500/10  border-yellow-500/20',
  alerted:          'text-purple-400  bg-purple-500/10  border-purple-500/20',
  entered:          'text-green-400   bg-green-500/10   border-green-500/20',
  active:           'text-green-400   bg-green-500/10   border-green-500/20',
  partially_exited: 'text-orange-400  bg-orange-500/10  border-orange-500/20',
  closed_win:       'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
  closed_loss:      'text-red-400     bg-red-500/10     border-red-500/20',
  expired:          'text-gray-500    bg-gray-500/10    border-gray-500/20',
  invalidated:      'text-gray-500    bg-gray-500/10    border-gray-500/20',
  cancelled:        'text-gray-500    bg-gray-500/10    border-gray-500/20',
  suspended:        'text-orange-400  bg-orange-500/10  border-orange-500/20',
}

const OUTCOME_BADGE: Record<string, string> = {
  big_win:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  small_win:  'text-lime-400    bg-lime-500/10    border-lime-500/20',
  breakeven:  'text-yellow-400  bg-yellow-500/10  border-yellow-500/20',
  small_loss: 'text-orange-400  bg-orange-500/10  border-orange-500/20',
  big_loss:   'text-red-400     bg-red-500/10     border-red-500/20',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  E: 'text-red-400',
}

function DirectionBadge({ bias, optionType }: { bias: string | null; optionType: string }) {
  const isCall = optionType?.toLowerCase() === 'call'
  const isBull = bias === 'bullish' || (bias == null && isCall)
  const label  = bias ?? optionType ?? '—'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
      isBull
        ? 'text-green-400  bg-green-500/10  border-green-500/20'
        : 'text-red-400    bg-red-500/10    border-red-500/20'
    }`}>
      {isBull
        ? <TrendingUp  className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />
      }
      {label}
    </span>
  )
}

function PnlBar({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const clamp = Math.max(-100, Math.min(100, pct))
  const isPos = clamp >= 0
  const width = Math.abs(clamp)
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        {isPos ? (
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${width}%` }} />
        ) : (
          <div className="flex h-full justify-end">
            <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${width}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function ActiveTradeCard({ trade, onChanged }: { trade: SPXTrade; onChanged?: () => void }) {
  const hasEntry = trade.entryPremium !== null
  const stateCls = STATE_BADGE[trade.state] ?? 'text-slate-500 bg-white/5 border-white/10'
  const [suspending, setSuspending] = useState(false)

  async function handleSuspend() {
    if (!window.confirm('وقف متابعة هذا العقد وإرسال تنبيه بالوقف؟\nSuspend tracking for this contract and send a suspension alert?')) {
      return
    }
    setSuspending(true)
    try {
      const res = await fetch(`/api/spx/trades/${trade.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suspend' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error || `HTTP ${res.status}`)
      } else {
        onChanged?.()
      }
    } catch (err: any) {
      alert(err?.message || 'Network error')
    } finally {
      setSuspending(false)
    }
  }

  return (
    <div className="bg-[#0b1525] border border-white/[0.07] rounded-2xl p-5 space-y-4">
      {/* Top: ticker + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-base font-bold text-white tracking-wide">{trade.ticker}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${stateCls}`}>
          {trade.state.replace(/_/g, ' ')}
        </span>
        <DirectionBadge bias={trade.directionBias} optionType={trade.optionType} />
        <div className="ml-auto flex items-center gap-2">
          {trade.dte != null && (
            <span className="text-xs text-slate-500">DTE: {trade.dte}</span>
          )}
          <button
            onClick={handleSuspend}
            disabled={suspending}
            title="وقف متابعة العقد / Suspend tracking"
            className="flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300 border border-orange-500/30 hover:border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/15 px-2 py-1 rounded-lg transition-all disabled:opacity-40"
          >
            {suspending ? <Loader2 className="w-3 h-3 animate-spin" /> : <PauseCircle className="w-3 h-3" />}
            وقف / Suspend
          </button>
        </div>
      </div>

      {/* P&L section */}
      <div className="bg-white/[0.03] rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {hasEntry ? (
            <>
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">Entry</span>
                <span className="font-bold text-slate-300 tabular-nums">{fmt(trade.entryPremium)}</span>
              </div>
              <span className="text-slate-700 text-lg">→</span>
              <div className="text-xs">
                <span className="text-slate-500 block mb-0.5">Current</span>
                <span className="font-bold text-white tabular-nums">{fmt(trade.currentPremium)}</span>
              </div>
              {trade.unrealizedPnlPct != null && (
                <div className="ml-auto text-right">
                  <span className={`text-xl font-bold tabular-nums ${pnlColorClass(trade.unrealizedPnlPct)}`}>
                    {fmtPct(trade.unrealizedPnlPct)}
                  </span>
                  <PnlBar pct={trade.unrealizedPnlPct} />
                </div>
              )}
            </>
          ) : (
            <>
              <span className="text-xs text-slate-500 italic">Not entered</span>
              {trade.currentPremium != null && (
                <div className="text-xs">
                  <span className="text-slate-500 block mb-0.5">Current</span>
                  <span className="font-bold text-slate-300 tabular-nums">{fmt(trade.currentPremium)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* High / Low */}
        {(trade.highestPremium != null || trade.lowestPremium != null) && (
          <div className="flex gap-4 text-xs">
            <span className="text-slate-600">High: <span className="text-slate-400 tabular-nums font-semibold">{fmt(trade.highestPremium)}</span></span>
            <span className="text-slate-600">Low: <span className="text-slate-400 tabular-nums font-semibold">{fmt(trade.lowestPremium)}</span></span>
          </div>
        )}
      </div>

      {/* Targets */}
      {(trade.stopPremium != null || trade.target1Premium != null) && (
        <div className="grid grid-cols-4 gap-2">
          {trade.stopPremium != null && (
            <div className="bg-red-500/5 border border-red-500/15 rounded-xl px-2 py-2 text-center">
              <div className="text-[9px] text-red-500/70 uppercase font-bold mb-0.5">Stop</div>
              <div className="text-xs text-slate-400 tabular-nums font-semibold">{fmt(trade.stopPremium)}</div>
            </div>
          )}
          {[trade.target1Premium, trade.target2Premium, trade.target3Premium].filter(Boolean).map((t, i) => (
            <div key={i} className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-2 py-2 text-center">
              <div className="text-[9px] text-emerald-500/60 uppercase font-bold mb-0.5">T{i + 1}</div>
              <div className="text-xs text-slate-400 tabular-nums font-semibold">{fmt(t)}</div>
            </div>
          ))}
        </div>
      )}

      {/* MFE / MAE */}
      {(trade.mfe != null || trade.mae != null) && (
        <div className="flex gap-4 text-xs">
          {trade.mfe != null && (
            <span>
              <span className="text-slate-500">MFE </span>
              <span className="text-emerald-400 font-bold tabular-nums">+{trade.mfe.toFixed(1)}%</span>
            </span>
          )}
          {trade.mae != null && (
            <span>
              <span className="text-slate-500">MAE </span>
              <span className="text-red-400 font-bold tabular-nums">-{Math.abs(trade.mae).toFixed(1)}%</span>
            </span>
          )}
        </div>
      )}

      {/* Signal metadata */}
      <div className="flex flex-wrap items-center gap-2 text-xs border-t border-white/[0.05] pt-3">
        {trade.signalMode && (
          <span className="text-slate-500">
            Mode: <span className="text-slate-300 font-semibold">{trade.signalMode.replace(/_/g, ' ')}</span>
          </span>
        )}
        {trade.confidenceClass && (
          <span className="text-slate-500">
            Conf: <span className={`font-bold ${CONFIDENCE_COLORS[trade.confidenceClass] ?? 'text-slate-400'}`}>{trade.confidenceClass}</span>
          </span>
        )}
        {trade.compositeScore != null && (
          <span className="text-slate-500">
            Score: <span className="text-slate-300 font-bold tabular-nums">{trade.compositeScore.toFixed(0)}</span>
          </span>
        )}
        {trade.time_stop_at && (
          <span className="flex items-center gap-1 text-amber-400/80 ml-auto">
            <Clock className="w-3 h-3" />
            Stop {formatTimeStop(trade.time_stop_at)}
          </span>
        )}
      </div>
    </div>
  )
}

function ClosedTradeRow({ trade }: { trade: SPXTrade }) {
  const pnl = trade.realizedPnlPct
  const outcomeCls = OUTCOME_BADGE[trade.finalScoreOutcome ?? ''] ?? 'text-slate-500 bg-white/5 border-white/10'
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#0b1525] border border-white/[0.06] rounded-xl">
      <span className="font-mono text-sm font-bold text-slate-300 min-w-[90px]">{trade.ticker}</span>
      <span className={`px-2 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wide ${outcomeCls}`}>
        {trade.finalScoreOutcome ? trade.finalScoreOutcome.replace(/_/g, ' ') : '—'}
      </span>
      <span className={`text-sm font-bold tabular-nums ${pnlColorClass(pnl)}`}>
        {pnl != null ? fmtPct(pnl) : '—'}
      </span>
      {trade.exitReason && (
        <span className="text-xs text-slate-600 ml-auto truncate max-w-[120px]">
          {trade.exitReason.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  )
}

export function ActiveTradesPanel({ className = '' }: { className?: string }) {
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
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-4 h-4 text-green-400 ${loading ? 'animate-pulse' : ''}`} />
            <span className="text-sm font-bold text-white">Active Trades</span>
          </div>
          {activeTrades.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border text-green-400 bg-green-500/10 border-green-500/20">
              {activeTrades.length} open
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-slate-500">{lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={fetchTrades}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {!data && loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center space-y-3">
            <Activity className="w-8 h-8 text-green-400 animate-spin mx-auto" />
            <div className="text-sm text-slate-500">Loading trades…</div>
          </div>
        </div>
      )}

      {/* Trades */}
      {data && (
        <>
          {activeTrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                <Target className="w-7 h-7 text-slate-600" />
              </div>
              <div className="text-base text-slate-400 font-semibold">No active trades</div>
              <div className="text-xs text-slate-600 text-center max-w-xs">
                Trades appear here when the engine detects and enters positions.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTrades.map(trade => (
                <ActiveTradeCard key={trade.id} trade={trade} onChanged={fetchTrades} />
              ))}
            </div>
          )}

          {/* Closed trades */}
          {recentTrades.length > 0 && (
            <div className="space-y-2 border-t border-white/[0.06] pt-5">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
                Recent Closed Trades
              </div>
              <div className="space-y-2">
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
