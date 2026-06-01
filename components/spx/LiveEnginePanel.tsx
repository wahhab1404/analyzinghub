'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, PlusCircle, Play, Square, Bot } from 'lucide-react'
import { ScoreGauge, SubScoreBar } from './ScoreGauge'
import { WallDisplay } from './WallDisplay'
import { SignalCard } from './SignalCard'
import type { SPXIntelligenceResult } from '@/services/spx/types'

interface LiveEnginePanelProps {
  className?: string
}

const ACTIONABLE_SIGNAL_TYPES = new Set([
  'BUY_CALL', 'BUY_PUT', 'WATCH_CALL', 'WATCH_PUT',
])

function TrendBadge({ dir }: { dir: string }) {
  if (dir === 'bullish') return <span className="text-emerald-400 flex items-center gap-1 font-semibold"><TrendingUp className="w-3.5 h-3.5" />Bull</span>
  if (dir === 'bearish') return <span className="text-red-400 flex items-center gap-1 font-semibold"><TrendingDown className="w-3.5 h-3.5" />Bear</span>
  if (dir === 'neutral') return <span className="text-slate-500 flex items-center gap-1"><Minus className="w-3.5 h-3.5" />Flat</span>
  return <span className="text-slate-700">—</span>
}

function DataQualityBadge({ quality }: { quality: string }) {
  const cfg =
    quality === 'high'   ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' :
    quality === 'medium' ? 'text-amber-400   bg-amber-500/10   border-amber-500/25'   :
                           'text-red-400     bg-red-500/10     border-red-500/25'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg}`}>
      {quality} data
    </span>
  )
}

export function LiveEnginePanel({ className = '' }: LiveEnginePanelProps) {
  const [result, setResult] = useState<SPXIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null)
  const [tradeError, setTradeError]     = useState<string | null>(null)

  // Phase 5: engine on/off
  const [engineEnabled, setEngineEnabled] = useState<boolean | null>(null)
  const [autoTradeEnabled, setAutoTradeEnabled] = useState<boolean>(false)
  const [toggleBusy, setToggleBusy] = useState(false)

  const refreshEngineState = useCallback(async () => {
    try {
      const r = await fetch('/api/spx/engine-toggle')
      const j = await r.json()
      if (j?.success) {
        setEngineEnabled(!!j.engineEnabled)
        setAutoTradeEnabled(!!j.autoTradeEnabled)
      }
    } catch {/* ignore */}
  }, [])

  const toggleEngine = useCallback(async () => {
    if (engineEnabled == null) return
    setToggleBusy(true)
    try {
      const r = await fetch('/api/spx/engine-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !engineEnabled }),
      })
      const j = await r.json()
      if (j?.success) setEngineEnabled(!!j.engineEnabled)
    } finally { setToggleBusy(false) }
  }, [engineEnabled])

  const refresh = useCallback(async (skipWalls = false) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/spx/signal?skipContracts=false${skipWalls ? '&skipWalls=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Signal fetch failed')
      }
      const data = await res.json()
      setResult({
        features: data.features,
        walls: data.walls,
        shock: data.shock,
        signal: data.signal,
        contracts: data.contracts,
        engineState: data.engineState,
        computedAt: data.computedAt,
      })
      setLastRefresh(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    refreshEngineState()
    const interval = setInterval(() => refresh(true), 30_000)
    const stateInterval = setInterval(refreshEngineState, 15_000)
    return () => { clearInterval(interval); clearInterval(stateInterval) }
  }, [refresh, refreshEngineState])

  const createTradeFromSignal = useCallback(async () => {
    if (!result?.signal?.id) return
    setTradeLoading(true)
    setTradeSuccess(null)
    setTradeError(null)
    try {
      const res = await fetch('/api/spx/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_from_signal', signalId: result.signal.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setTradeSuccess(`Trade created: ${data.tradeId ?? data.id ?? 'OK'}`)
    } catch (err: any) {
      setTradeError(err.message)
    } finally {
      setTradeLoading(false)
    }
  }, [result])

  const features = result?.features
  const shock    = result?.shock
  const signal   = result?.signal

  return (
    <div className={`space-y-5 ${className}`}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm font-bold text-white">Live Engine</span>
          </div>
          {features && <DataQualityBadge quality={features.dataQuality} />}
          {autoTradeEnabled && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-violet-400 bg-violet-500/10 border border-violet-500/25 px-2.5 py-1 rounded-full">
              <Bot className="w-3 h-3" /> Auto ON
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-slate-500">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          {/* ── Engine Start / Stop ── */}
          {engineEnabled !== null && (
            <button
              onClick={toggleEngine}
              disabled={toggleBusy}
              className={`flex items-center gap-1.5 text-sm font-bold px-4 py-1.5 rounded-lg border transition-all disabled:opacity-40 ${
                engineEnabled
                  ? 'text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              {engineEnabled
                ? <><Square className="w-3.5 h-3.5" /> Stop Engine</>
                : <><Play className="w-3.5 h-3.5" /> Start Engine</>
              }
            </button>
          )}
          <button
            onClick={() => refresh(false)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Engine stopped notice ─────────────────────────────────────────── */}
      {engineEnabled === false && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
          <Square className="w-4 h-4 flex-shrink-0" />
          Engine is stopped. Click <strong>Start Engine</strong> to begin background analysis. Runs every 30 seconds even when this page is closed.
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {!result && loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center space-y-3">
            <Activity className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
            <div className="text-sm text-slate-500">Computing intelligence engine…</div>
          </div>
        </div>
      )}

      {result && (
        <>
          {/* ── SPX Price Row ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-0 bg-[#0b1525] border border-white/[0.07] rounded-2xl overflow-hidden">
            {/* SPX Price */}
            <div className="flex-shrink-0 px-5 py-4 border-r border-white/[0.06]">
              <div className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">SPX</div>
              <div className="text-3xl font-bold text-white tabular-nums tracking-tight">
                {features?.underlying.price.toFixed(2)}
              </div>
            </div>

            {/* Mode */}
            <div className="flex-shrink-0 px-5 py-4 border-r border-white/[0.06]">
              <div className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">Mode</div>
              <div className="text-sm font-bold text-slate-200">{features?.marketMode ?? '—'}</div>
            </div>

            {/* Trends */}
            <div className="flex-1 px-5 py-4 border-r border-white/[0.06]">
              <div className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-2">Trend</div>
              <div className="flex items-center gap-4">
                <div className="text-xs">
                  <span className="text-slate-600 mr-1.5">1m</span>
                  <TrendBadge dir={features?.underlying.trend1m ?? 'unknown'} />
                </div>
                <div className="text-xs">
                  <span className="text-slate-600 mr-1.5">5m</span>
                  <TrendBadge dir={features?.underlying.trend5m ?? 'unknown'} />
                </div>
                <div className="text-xs">
                  <span className="text-slate-600 mr-1.5">15m</span>
                  <TrendBadge dir={features?.underlying.trend15m ?? 'unknown'} />
                </div>
              </div>
            </div>

            {/* VWAP */}
            {features?.underlying.vwapEstimate && (
              <div className="flex-shrink-0 px-5 py-4 hidden sm:block">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">TWA-VWAP</div>
                <div className={`text-sm font-bold tabular-nums ${
                  features.underlying.vwapRelation === 'above' ? 'text-emerald-400' :
                  features.underlying.vwapRelation === 'below' ? 'text-red-400' : 'text-slate-400'
                }`}>
                  {features.underlying.vwapEstimate.toFixed(2)}
                  <span className="text-xs text-slate-600 ml-1.5 font-normal">({features.underlying.vwapRelation})</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Signal + Shock ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {signal && <SignalCard signal={signal} />}

            {shock && (
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b1525] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold text-white">Shock Engine</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                    shock.severity === 'extreme'  ? 'text-red-400    bg-red-500/10    border-red-500/30'    :
                    shock.severity === 'severe'   ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
                    shock.severity === 'moderate' ? 'text-amber-400  bg-amber-500/10  border-amber-500/30'  :
                    shock.severity === 'mild'     ? 'text-blue-400   bg-blue-500/10   border-blue-500/20'   :
                    'text-slate-500 bg-white/5 border-white/10'
                  }`}>
                    {shock.severityLabel}
                  </span>
                </div>

                <div className="flex items-center gap-5">
                  <ScoreGauge score={shock.shockScore}          label="Shock"     size="sm" />
                  <ScoreGauge score={shock.accelerationScore}   label="Accel"     size="sm" />
                  <ScoreGauge score={shock.compositeShockScore} label="Composite" size="sm" />
                </div>

                <div className="space-y-2">
                  {shock.priceVelocity1m !== null && (
                    <MetricRow
                      label="Velocity 1m"
                      value={`${shock.priceVelocity1m > 0 ? '+' : ''}${shock.priceVelocity1m.toFixed(2)} pts/min`}
                      valueClass={shock.priceVelocity1m > 0 ? 'text-emerald-400' : shock.priceVelocity1m < 0 ? 'text-red-400' : 'text-slate-400'}
                    />
                  )}
                  {shock.priceVelocity5m !== null && (
                    <MetricRow
                      label="Velocity 5m"
                      value={`${shock.priceVelocity5m > 0 ? '+' : ''}${shock.priceVelocity5m.toFixed(2)} pts/min`}
                      valueClass={shock.priceVelocity5m > 0 ? 'text-emerald-400' : shock.priceVelocity5m < 0 ? 'text-red-400' : 'text-slate-400'}
                    />
                  )}
                  <MetricRow
                    label="Continuation"
                    value={`${(shock.continuationProbability * 100).toFixed(0)}%`}
                    valueClass="text-slate-200"
                  />
                  <MetricRow
                    label="Reversal"
                    value={`${(shock.reversalProbability * 100).toFixed(0)}%`}
                    valueClass="text-slate-200"
                  />
                </div>

                {shock.patterns.length > 0 && (
                  <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
                    {shock.patterns.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="text-orange-500/50 flex-shrink-0">▸</span>{p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Walls ─────────────────────────────────────────────────────── */}
          {result.walls && (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0b1525] p-5">
              <WallDisplay walls={result.walls} marketMode={features?.marketMode} />
            </div>
          )}

          {/* ── Chain Summary ─────────────────────────────────────────────── */}
          {features && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'ATM Strike',   value: features.chain.atmStrike.toFixed(0) },
                { label: 'DTE Regime',   value: features.chain.dteRegime },
                { label: 'P/C OI Ratio', value: features.chain.putCallOIRatio.toFixed(2) },
                { label: 'Flow Bias',    value: features.flow.callPutFlowBias.replace('_', ' ') },
              ].map(item => (
                <div key={item.label} className="bg-[#0b1525] border border-white/[0.07] rounded-xl px-4 py-3">
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-medium mb-1">{item.label}</div>
                  <div className="text-base font-bold text-slate-200">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Greeks ────────────────────────────────────────────────────── */}
          {features?.greeks && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Delta', value: features.greeks.atmDelta?.toFixed(3) },
                { label: 'Gamma', value: features.greeks.atmGamma?.toFixed(4) },
                { label: 'Theta', value: features.greeks.atmTheta?.toFixed(3) },
                { label: 'Vega',  value: features.greeks.atmVega?.toFixed(3) },
                { label: 'IV',    value: features.greeks.atmIV ? `${(features.greeks.atmIV * 100).toFixed(1)}%` : null },
                { label: 'IV Δ',  value: features.greeks.ivChange ? `${features.greeks.ivChange > 0 ? '+' : ''}${(features.greeks.ivChange * 100).toFixed(2)}%` : null },
              ].map(item => (
                <div key={item.label} className="bg-[#0b1525] border border-white/[0.07] rounded-xl px-3 py-2.5">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1">{item.label}</div>
                  <div className="text-xs font-bold text-slate-300 tabular-nums">{item.value ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Trade Actions ─────────────────────────────────────────────── */}
          {signal && ACTIONABLE_SIGNAL_TYPES.has(signal.type ?? '') && (
            <div className="rounded-2xl border border-white/[0.07] bg-[#0b1525] p-5">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Trade Actions</div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={createTradeFromSignal}
                  disabled={tradeLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <PlusCircle className={`w-4 h-4 ${tradeLoading ? 'animate-spin' : ''}`} />
                  {tradeLoading ? 'Creating…' : 'Create Trade from Signal'}
                </button>
                {tradeSuccess && (
                  <span className="text-sm text-emerald-400 font-medium">{tradeSuccess}</span>
                )}
                {tradeError && (
                  <span className="text-sm text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {tradeError}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass ?? 'text-slate-300'}`}>{value}</span>
    </div>
  )
}
