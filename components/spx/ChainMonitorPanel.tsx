'use client'

/**
 * components/spx/ChainMonitorPanel.tsx
 *
 * Chain Monitor tab: displays live options chain features, greeks, flow metrics,
 * and GEX/skew context. Refreshes every 60s.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle, BarChart2 } from 'lucide-react'
import type { SPXFeatures } from '@/services/spx/types'

interface MetricRow {
  label: string
  value: string | null
  color?: string
  subLabel?: string
}

function MetricTable({ rows }: { rows: MetricRow[] }) {
  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between py-1 border-b border-[#1a2840]/50">
          <span className="text-[10px] text-slate-600">{row.label}</span>
          <div className="text-right">
            <span className={`text-[10px] font-semibold tabular-nums ${row.color ?? 'text-slate-300'}`}>
              {row.value ?? '—'}
            </span>
            {row.subLabel && (
              <span className="text-[9px] text-slate-600 ml-1">({row.subLabel})</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChainMonitorPanel({ className = '' }: { className?: string }) {
  const [features, setFeatures] = useState<SPXFeatures | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/spx/features')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Feature fetch failed')
      setFeatures(data.features)
      setLastRefresh(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [refresh])

  const f = features

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Chain Monitor</span>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && <span className="text-[9px] text-slate-600">{lastRefresh.toLocaleTimeString()}</span>}
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {!f && loading && (
        <div className="text-center py-10 text-slate-500 text-[11px]">Loading chain data…</div>
      )}

      {f && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Chain context */}
          <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Chain Context</div>
            <MetricTable rows={[
              { label: 'ATM Strike',        value: f.chain.atmStrike.toFixed(0) },
              { label: 'Near ITM',          value: f.chain.nearITMStrike?.toFixed(0) ?? null },
              { label: 'Near OTM',          value: f.chain.nearOTMStrike?.toFixed(0) ?? null },
              { label: 'High-OI Call',      value: f.chain.highOICallStrike?.toFixed(0) ?? null,  color: 'text-red-400' },
              { label: 'High-OI Put',       value: f.chain.highOIPutStrike?.toFixed(0) ?? null,   color: 'text-emerald-400' },
              { label: 'High-Vol Call',     value: f.chain.highVolumeCallStrike?.toFixed(0) ?? null },
              { label: 'High-Vol Put',      value: f.chain.highVolumePutStrike?.toFixed(0) ?? null },
              { label: 'High-Gamma Strike', value: f.chain.highGammaStrike?.toFixed(0) ?? null,   color: 'text-blue-400' },
              { label: 'DTE Regime',        value: f.chain.dteRegime },
              { label: 'Nearest Expiry',    value: f.chain.nearestExpiry },
            ]} />
          </div>

          {/* OI / Flow */}
          <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">OI & Flow</div>
            <MetricTable rows={[
              { label: 'Total Call OI',   value: f.chain.totalCallOI.toLocaleString(),    color: 'text-red-400' },
              { label: 'Total Put OI',    value: f.chain.totalPutOI.toLocaleString(),     color: 'text-emerald-400' },
              { label: 'P/C OI Ratio',    value: f.chain.putCallOIRatio.toFixed(2),
                color: f.chain.putCallOIRatio > 1.2 ? 'text-emerald-400' : f.chain.putCallOIRatio < 0.8 ? 'text-red-400' : 'text-slate-300',
                subLabel: f.chain.putCallOIRatio > 1.2 ? 'put heavy' : f.chain.putCallOIRatio < 0.8 ? 'call heavy' : 'balanced' },
              { label: 'Call Volume',     value: f.chain.totalCallVolume.toLocaleString(), color: 'text-red-400' },
              { label: 'Put Volume',      value: f.chain.totalPutVolume.toLocaleString(),  color: 'text-emerald-400' },
              { label: 'P/C Vol Ratio',   value: f.chain.putCallVolumeRatio.toFixed(2) },
              { label: 'Flow Bias',       value: f.flow.callPutFlowBias.replace('_', ' '),
                color: f.flow.callPutFlowBias === 'call_heavy' ? 'text-red-400' : f.flow.callPutFlowBias === 'put_heavy' ? 'text-emerald-400' : 'text-slate-400' },
              { label: 'Bias Strength',   value: `${(f.flow.biasStrength * 100).toFixed(0)}%` },
              { label: 'Call Vol Burst',  value: f.flow.callVolumeBurst ? 'YES' : 'No', color: f.flow.callVolumeBurst ? 'text-orange-400' : 'text-slate-600' },
              { label: 'Put Vol Burst',   value: f.flow.putVolumeBurst ? 'YES' : 'No',  color: f.flow.putVolumeBurst ? 'text-orange-400' : 'text-slate-600' },
              { label: 'Sweep (Call)',    value: f.flow.callSweepDetected ? 'DETECTED' : 'No', color: f.flow.callSweepDetected ? 'text-violet-400' : 'text-slate-600' },
              { label: 'Sweep (Put)',     value: f.flow.putSweepDetected ? 'DETECTED' : 'No',  color: f.flow.putSweepDetected ? 'text-violet-400' : 'text-slate-600' },
            ]} />
          </div>

          {/* Greeks & IV */}
          <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Greeks & Volatility</div>
            <MetricTable rows={[
              { label: 'ATM Delta',    value: f.greeks.atmDelta?.toFixed(4) ?? null },
              { label: 'ATM Gamma',    value: f.greeks.atmGamma?.toFixed(6) ?? null },
              { label: 'ATM Theta',    value: f.greeks.atmTheta?.toFixed(4) ?? null, color: 'text-red-400' },
              { label: 'ATM Vega',     value: f.greeks.atmVega?.toFixed(4) ?? null },
              { label: 'ATM IV',       value: f.greeks.atmIV ? `${(f.greeks.atmIV * 100).toFixed(2)}%` : null },
              { label: 'IV Change',    value: f.greeks.ivChange ? `${f.greeks.ivChange > 0 ? '+' : ''}${(f.greeks.ivChange * 100).toFixed(2)}%` : null,
                color: f.greeks.ivChange != null ? (f.greeks.ivChange > 0 ? 'text-orange-400' : 'text-emerald-400') : undefined },
              { label: 'GEX Estimate', value: f.greeks.gexEstimate?.toFixed(2) ?? null, subLabel: 'heuristic' },
              { label: 'GEX Bias',     value: f.greeks.gexBias,
                color: f.greeks.gexBias === 'positive' ? 'text-emerald-400' : f.greeks.gexBias === 'negative' ? 'text-red-400' : 'text-slate-400' },
              { label: 'IV Skew Est',  value: f.greeks.ivSkewEstimate?.toFixed(4) ?? null, subLabel: 'heuristic' },
              { label: 'Skew Bias',    value: f.greeks.skewBias,
                color: f.greeks.skewBias === 'put_premium' ? 'text-emerald-400' : f.greeks.skewBias === 'call_premium' ? 'text-red-400' : 'text-slate-400' },
            ]} />
          </div>

          {/* Underlying */}
          <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Underlying Context</div>
            <MetricTable rows={[
              { label: 'Price',         value: f.underlying.price.toFixed(2), color: 'text-white' },
              { label: 'Session Open',  value: f.underlying.sessionOpen?.toFixed(2) ?? null },
              { label: 'Session High',  value: f.underlying.sessionHigh?.toFixed(2) ?? null },
              { label: 'Session Low',   value: f.underlying.sessionLow?.toFixed(2) ?? null },
              { label: 'Prev Close',    value: f.underlying.previousClose?.toFixed(2) ?? null },
              { label: '1m Trend',      value: f.underlying.trend1m,
                color: f.underlying.trend1m === 'bullish' ? 'text-emerald-400' : f.underlying.trend1m === 'bearish' ? 'text-red-400' : 'text-slate-400' },
              { label: '5m Trend',      value: f.underlying.trend5m,
                color: f.underlying.trend5m === 'bullish' ? 'text-emerald-400' : f.underlying.trend5m === 'bearish' ? 'text-red-400' : 'text-slate-400' },
              { label: '15m Trend',     value: f.underlying.trend15m,
                color: f.underlying.trend15m === 'bullish' ? 'text-emerald-400' : f.underlying.trend15m === 'bearish' ? 'text-red-400' : 'text-slate-400' },
              { label: 'Momentum',      value: f.underlying.momentumLabel.replace(/_/g, ' ') },
              { label: 'Slope (pts/min)', value: f.underlying.momentumSlope?.toFixed(2) ?? null },
              { label: 'TWA-VWAP',      value: f.underlying.vwapEstimate?.toFixed(2) ?? null, subLabel: 'heuristic' },
              { label: 'VWAP Relation', value: f.underlying.vwapRelation,
                color: f.underlying.vwapRelation === 'above' ? 'text-emerald-400' : f.underlying.vwapRelation === 'below' ? 'text-red-400' : 'text-slate-400' },
              { label: 'OR Position',   value: f.underlying.openingRangePosition },
            ]} />
          </div>

          {/* Execution quality */}
          <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-3">Execution Quality (ATM)</div>
            <MetricTable rows={[
              { label: 'Spread',         value: f.execution.bidAskSpread?.toFixed(2) ?? null },
              { label: 'Spread %',       value: f.execution.spreadPct?.toFixed(1) ? `${f.execution.spreadPct.toFixed(1)}%` : null,
                color: (f.execution.spreadPct ?? 999) < 5 ? 'text-emerald-400' : (f.execution.spreadPct ?? 999) < 15 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Spread Quality', value: f.execution.spreadQuality },
              { label: 'Liquidity Score',value: `${f.execution.liquidityScore}/100`,
                color: f.execution.liquidityScore > 70 ? 'text-emerald-400' : f.execution.liquidityScore > 40 ? 'text-amber-400' : 'text-red-400' },
              { label: 'Slippage Risk',  value: f.execution.slippageRiskLabel,
                color: f.execution.slippageRiskLabel === 'low' ? 'text-emerald-400' : f.execution.slippageRiskLabel === 'medium' ? 'text-amber-400' : 'text-red-400' },
              { label: 'Quote Quality',  value: f.execution.quoteQuality },
            ]} />

            {/* Concentration zones */}
            {(f.chain.callConcentrationZone || f.chain.putConcentrationZone) && (
              <>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mt-4 mb-2">Concentration Zones</div>
                {f.chain.callConcentrationZone && (
                  <div className="text-[10px] flex justify-between py-1 border-b border-[#1a2840]/50">
                    <span className="text-slate-600">Call zone</span>
                    <span className="text-red-400 tabular-nums">
                      {f.chain.callConcentrationZone.low}–{f.chain.callConcentrationZone.high}
                    </span>
                  </div>
                )}
                {f.chain.putConcentrationZone && (
                  <div className="text-[10px] flex justify-between py-1 border-b border-[#1a2840]/50">
                    <span className="text-slate-600">Put zone</span>
                    <span className="text-emerald-400 tabular-nums">
                      {f.chain.putConcentrationZone.low}–{f.chain.putConcentrationZone.high}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {f?.warnings && f.warnings.length > 0 && (
        <div className="space-y-1">
          {f.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[9px] text-amber-500/60">
              <AlertTriangle className="w-2.5 h-2.5" />{w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
