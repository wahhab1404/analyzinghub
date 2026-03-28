'use client'

/**
 * components/spx/LiveEnginePanel.tsx
 *
 * Live Engine tab: full real-time view with composite score, walls, shock metrics,
 * and underlying feature summary. Auto-refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, Zap, TrendingUp, TrendingDown, Minus, AlertTriangle, PlusCircle } from 'lucide-react'
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

export function LiveEnginePanel({ className = '' }: LiveEnginePanelProps) {
  const [result, setResult] = useState<SPXIntelligenceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Trade Actions state
  const [tradeLoading, setTradeLoading]   = useState(false)
  const [tradeSuccess, setTradeSuccess]   = useState<string | null>(null)
  const [tradeError, setTradeError]       = useState<string | null>(null)

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

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    refresh()
    const interval = setInterval(() => refresh(true), 30_000)
    return () => clearInterval(interval)
  }, [refresh])

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
  const shock = result?.shock
  const signal = result?.signal

  function TrendBadge({ dir }: { dir: string }) {
    if (dir === 'bullish') return <span className="text-emerald-400 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />Bull</span>
    if (dir === 'bearish') return <span className="text-red-400 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />Bear</span>
    if (dir === 'neutral') return <span className="text-slate-500 flex items-center gap-0.5"><Minus className="w-3 h-3" />Flat</span>
    return <span className="text-slate-700">—</span>
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Live Engine
          </span>
          {features && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
              features.dataQuality === 'high'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : features.dataQuality === 'medium'
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : 'text-red-400 bg-red-500/10 border-red-500/20'
            }`}>
              {features.dataQuality} data
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[9px] text-slate-600">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refresh(false)}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!result && loading && (
        <div className="flex items-center justify-center h-40">
          <div className="text-center space-y-2">
            <Activity className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
            <div className="text-[11px] text-slate-500">Computing intelligence engine…</div>
          </div>
        </div>
      )}

      {result && (
        <>
          {/* SPX price row */}
          <div className="flex items-center gap-4 px-3 py-2 bg-[#0d1726] rounded-lg border border-[#1a2840]">
            <div>
              <div className="text-[9px] text-slate-600 uppercase">SPX</div>
              <div className="text-xl font-bold text-white tabular-nums">
                {features?.underlying.price.toFixed(2)}
              </div>
            </div>
            <div className="w-px h-8 bg-[#1a2840]" />
            <div>
              <div className="text-[9px] text-slate-600 uppercase">Mode</div>
              <div className="text-[11px] font-semibold text-slate-300">{features?.marketMode}</div>
            </div>
            <div className="w-px h-8 bg-[#1a2840]" />
            <div className="flex gap-3">
              <div className="text-[10px]"><span className="text-slate-600">1m </span><TrendBadge dir={features?.underlying.trend1m ?? 'unknown'} /></div>
              <div className="text-[10px]"><span className="text-slate-600">5m </span><TrendBadge dir={features?.underlying.trend5m ?? 'unknown'} /></div>
              <div className="text-[10px]"><span className="text-slate-600">15m </span><TrendBadge dir={features?.underlying.trend15m ?? 'unknown'} /></div>
            </div>
            {features?.underlying.vwapEstimate && (
              <>
                <div className="w-px h-8 bg-[#1a2840]" />
                <div>
                  <div className="text-[9px] text-slate-600 uppercase">TWA-VWAP</div>
                  <div className={`text-[11px] font-semibold tabular-nums ${
                    features.underlying.vwapRelation === 'above' ? 'text-emerald-400' :
                    features.underlying.vwapRelation === 'below' ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {features.underlying.vwapEstimate.toFixed(2)}
                    <span className="text-[9px] text-slate-600 ml-1">({features.underlying.vwapRelation})</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Two-column layout: signal + shock */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Signal card */}
            {signal && <SignalCard signal={signal} />}

            {/* Shock metrics */}
            {shock && (
              <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Shock Engine
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    shock.severity === 'extreme' ? 'text-red-400 bg-red-500/10 border-red-500/30' :
                    shock.severity === 'severe' ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
                    shock.severity === 'moderate' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
                    shock.severity === 'mild' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                    'text-slate-600 bg-transparent border-[#1a2840]'
                  }`}>
                    {shock.severityLabel}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <ScoreGauge score={shock.shockScore} label="Shock" size="sm" />
                  <ScoreGauge score={shock.accelerationScore} label="Accel" size="sm" />
                  <ScoreGauge score={shock.compositeShockScore} label="Composite" size="sm" />
                </div>

                <div className="space-y-1.5 text-[10px]">
                  {shock.priceVelocity1m !== null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Velocity 1m</span>
                      <span className={`font-semibold tabular-nums ${
                        shock.priceVelocity1m > 0 ? 'text-emerald-400' :
                        shock.priceVelocity1m < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {shock.priceVelocity1m > 0 ? '+' : ''}{shock.priceVelocity1m.toFixed(2)} pts/min
                      </span>
                    </div>
                  )}
                  {shock.priceVelocity5m !== null && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Velocity 5m</span>
                      <span className={`font-semibold tabular-nums ${
                        shock.priceVelocity5m > 0 ? 'text-emerald-400' :
                        shock.priceVelocity5m < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {shock.priceVelocity5m > 0 ? '+' : ''}{shock.priceVelocity5m.toFixed(2)} pts/min
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-600">Continuation prob</span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {(shock.continuationProbability * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Reversal prob</span>
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {(shock.reversalProbability * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {shock.patterns.length > 0 && (
                  <div className="space-y-1 border-t border-[#1a2840] pt-2">
                    {shock.patterns.map((p, i) => (
                      <div key={i} className="text-[9px] text-slate-500 flex items-center gap-1">
                        <span className="text-orange-500/50">▸</span>{p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Walls section */}
          {result.walls && (
            <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4">
              <WallDisplay walls={result.walls} />
            </div>
          )}

          {/* Options chain summary */}
          {features && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'ATM Strike',  value: features.chain.atmStrike.toFixed(0) },
                { label: 'DTE Regime',  value: features.chain.dteRegime },
                { label: 'P/C OI Ratio', value: features.chain.putCallOIRatio.toFixed(2) },
                { label: 'Flow Bias',   value: features.flow.callPutFlowBias.replace('_', ' ') },
              ].map(item => (
                <div key={item.label} className="bg-[#0d1726] border border-[#1a2840] rounded-lg px-3 py-2">
                  <div className="text-[9px] text-slate-600 uppercase tracking-wider">{item.label}</div>
                  <div className="text-sm font-semibold text-slate-200 mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Greeks row */}
          {features?.greeks && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Delta',  value: features.greeks.atmDelta?.toFixed(3) },
                { label: 'Gamma',  value: features.greeks.atmGamma?.toFixed(4) },
                { label: 'Theta',  value: features.greeks.atmTheta?.toFixed(3) },
                { label: 'Vega',   value: features.greeks.atmVega?.toFixed(3) },
                { label: 'IV',     value: features.greeks.atmIV ? `${(features.greeks.atmIV * 100).toFixed(1)}%` : null },
                { label: 'IV Δ',   value: features.greeks.ivChange ? `${features.greeks.ivChange > 0 ? '+' : ''}${(features.greeks.ivChange * 100).toFixed(2)}%` : null },
              ].map(item => (
                <div key={item.label} className="bg-[#0d1726] border border-[#1a2840] rounded-lg px-2 py-1.5">
                  <div className="text-[9px] text-slate-600 uppercase">{item.label}</div>
                  <div className="text-[11px] font-semibold text-slate-300 tabular-nums mt-0.5">
                    {item.value ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Trade Actions — only shown for actionable signal types */}
          {signal && ACTIONABLE_SIGNAL_TYPES.has(signal.type ?? '') && (
            <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 space-y-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
                Trade Actions
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={createTradeFromSignal}
                  disabled={tradeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusCircle className={`w-3.5 h-3.5 ${tradeLoading ? 'animate-spin' : ''}`} />
                  {tradeLoading ? 'Creating…' : 'Create Trade from Signal'}
                </button>
                {tradeSuccess && (
                  <span className="text-[10px] text-green-400">{tradeSuccess}</span>
                )}
                {tradeError && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
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
