'use client'

/**
 * components/spx/ContractFinderPanel.tsx
 *
 * Contract Finder tab: configurable contract ranking UI.
 * Users can set filters and get ranked best/backup/aggressive/conservative contracts.
 */

import { useState } from 'react'
import { Search, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Star, Shield, Zap, Target } from 'lucide-react'
import type { ContractRankingOutput, RankedContract } from '@/services/spx/types'

interface ContractFinderPanelProps {
  className?: string
}

const RANK_CONFIG = {
  best:         { label: 'Best',         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Star },
  backup:       { label: 'Backup',       color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: Shield },
  aggressive:   { label: 'Aggressive',   color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: Zap },
  conservative: { label: 'Conservative', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Target },
}

function ContractCard({ contract }: { contract: RankedContract }) {
  const cfg = RANK_CONFIG[contract.rankLabel]
  const Icon = cfg.icon

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3 h-3 ${cfg.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
          {contract.rankScore}
        </span>
      </div>

      <div className="text-xs font-mono text-slate-300 break-all">{contract.ticker}</div>

      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div>
          <div className="text-slate-600">Strike</div>
          <div className="text-white font-semibold">{contract.strike}</div>
        </div>
        <div>
          <div className="text-slate-600">Expiry</div>
          <div className="text-white font-semibold">{contract.expiry}</div>
        </div>
        <div>
          <div className="text-slate-600">DTE</div>
          <div className="text-white font-semibold">{contract.dte} <span className="text-slate-600">({contract.dteRegime})</span></div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div>
          <div className="text-slate-600">Bid</div>
          <div className="text-slate-300 tabular-nums">{contract.bid.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-600">Ask</div>
          <div className="text-slate-300 tabular-nums">{contract.ask.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-600">Mid</div>
          <div className="text-white font-semibold tabular-nums">${contract.mid.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-600">Spread</div>
          <div className={`font-semibold tabular-nums ${
            contract.spreadPct < 5 ? 'text-emerald-400' :
            contract.spreadPct < 15 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {contract.spreadPct.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <div>
          <div className="text-slate-600">Delta</div>
          <div className="text-slate-300 tabular-nums">{contract.delta?.toFixed(3) ?? '—'}</div>
        </div>
        <div>
          <div className="text-slate-600">IV</div>
          <div className="text-slate-300 tabular-nums">
            {contract.iv ? `${(contract.iv * 100).toFixed(1)}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-slate-600">Vol</div>
          <div className="text-slate-300">{contract.volume.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-slate-600">OI</div>
          <div className="text-slate-300">{contract.openInterest.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[9px] border-t border-white/5 pt-2">
        <div className="flex justify-between">
          <span className="text-slate-600">Liq</span>
          <span className="text-slate-400">{contract.liquidityScore}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Resp</span>
          <span className="text-slate-400">{contract.responsivenessScore}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Fit</span>
          <span className="text-slate-400">{contract.fitScore}</span>
        </div>
      </div>

      {contract.estimatedLeverage !== null && (
        <div className="text-[9px] text-slate-600">
          Leverage est: <span className="text-slate-400">{contract.estimatedLeverage.toFixed(2)}×</span>
          &nbsp;·&nbsp;Slippage: <span className={`${
            contract.slippageRiskLabel === 'low' ? 'text-emerald-400' :
            contract.slippageRiskLabel === 'medium' ? 'text-amber-400' : 'text-red-400'
          }`}>{contract.slippageRiskLabel}</span>
        </div>
      )}
    </div>
  )
}

export function ContractFinderPanel({ className = '' }: ContractFinderPanelProps) {
  const [contractType, setContractType] = useState<'call' | 'put'>('call')
  const [expiryPref, setExpiryPref] = useState<string>('any')
  const [minDelta, setMinDelta] = useState('0.15')
  const [maxDelta, setMaxDelta] = useState('0.60')
  const [maxSpread, setMaxSpread] = useState('30')
  const [minPremium, setMinPremium] = useState('')
  const [maxPremium, setMaxPremium] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ContractRankingOutput | null>(null)

  async function search() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        contractType,
        expiryPreference: expiryPref,
        minDelta,
        maxDelta,
        maxSpreadPct: maxSpread,
      })
      if (minPremium) params.set('minPremium', minPremium)
      if (maxPremium) params.set('maxPremium', maxPremium)

      const res = await fetch(`/api/spx/contracts?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Contract search failed')
      setResult(data.ranking)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const namedContracts = result
    ? [result.best, result.backup, result.aggressive, result.conservative].filter(
        (c): c is RankedContract => c !== null,
      )
    : []

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Contract Finder
        </span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-3 bg-[#0d1726] border border-[#1a2840] rounded-lg">
        {/* Direction */}
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Direction</label>
          <div className="flex gap-1 mt-1">
            {(['call', 'put'] as const).map(d => (
              <button
                key={d}
                onClick={() => setContractType(d)}
                className={`flex-1 text-[10px] font-semibold py-1 rounded transition-colors ${
                  contractType === d
                    ? d === 'call'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'text-slate-600 border border-[#1a2840] hover:text-slate-300'
                }`}
              >
                {d === 'call' ? <TrendingUp className="w-3 h-3 mx-auto" /> : <TrendingDown className="w-3 h-3 mx-auto" />}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Expiry</label>
          <select
            value={expiryPref}
            onChange={e => setExpiryPref(e.target.value)}
            className="mt-1 w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-1 py-1"
          >
            <option value="any">Any</option>
            <option value="0DTE">0DTE</option>
            <option value="1DTE">1DTE</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Delta range */}
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Min Δ</label>
          <input
            type="number"
            value={minDelta}
            onChange={e => setMinDelta(e.target.value)}
            step="0.05"
            min="0.01"
            max="0.99"
            className="mt-1 w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-2 py-1 tabular-nums"
          />
        </div>
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Max Δ</label>
          <input
            type="number"
            value={maxDelta}
            onChange={e => setMaxDelta(e.target.value)}
            step="0.05"
            min="0.01"
            max="0.99"
            className="mt-1 w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-2 py-1 tabular-nums"
          />
        </div>

        {/* Spread */}
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Max Spread %</label>
          <input
            type="number"
            value={maxSpread}
            onChange={e => setMaxSpread(e.target.value)}
            step="5"
            min="1"
            max="100"
            className="mt-1 w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-2 py-1 tabular-nums"
          />
        </div>

        {/* Premium range */}
        <div>
          <label className="text-[9px] text-slate-600 uppercase tracking-wider">Premium $</label>
          <div className="flex gap-1 mt-1">
            <input
              type="number"
              placeholder="min"
              value={minPremium}
              onChange={e => setMinPremium(e.target.value)}
              className="w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-1.5 py-1 tabular-nums"
            />
            <input
              type="number"
              placeholder="max"
              value={maxPremium}
              onChange={e => setMaxPremium(e.target.value)}
              className="w-full bg-[#070e1a] border border-[#1a2840] rounded text-[10px] text-slate-300 px-1.5 py-1 tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Search button */}
      <button
        onClick={search}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold transition-all ${
          contractType === 'call'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
        } disabled:opacity-50`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Searching…' : `Find Best ${contractType === 'call' ? 'Call' : 'Put'} Contracts`}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span>Scanned {result.filterSummary.totalChainContracts} contracts</span>
            <span>·</span>
            <span>{result.filterSummary.finalCandidates} passed filters</span>
          </div>

          {namedContracts.length === 0 ? (
            <div className="text-[11px] text-slate-600 py-6 text-center">
              No contracts passed the filters. Try relaxing delta range or spread limit.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {namedContracts.map(c => (
                <ContractCard key={c.ticker} contract={c} />
              ))}
            </div>
          )}

          {/* All candidates table */}
          {result.allCandidates.length > 4 && (
            <details className="group">
              <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-300 transition-colors select-none">
                All {result.allCandidates.length} candidates ▸
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[10px] text-slate-400 border-collapse">
                  <thead>
                    <tr className="text-[9px] text-slate-600 uppercase border-b border-[#1a2840]">
                      <th className="text-left py-1.5 pr-3">Ticker</th>
                      <th className="text-right pr-3">Strike</th>
                      <th className="text-right pr-3">DTE</th>
                      <th className="text-right pr-3">Mid</th>
                      <th className="text-right pr-3">Spread%</th>
                      <th className="text-right pr-3">Delta</th>
                      <th className="text-right">Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allCandidates.slice(0, 20).map(c => (
                      <tr key={c.ticker} className="border-b border-[#1a2840]/50">
                        <td className="py-1 pr-3 font-mono text-[9px] text-slate-500">{c.ticker}</td>
                        <td className="text-right pr-3 tabular-nums">{c.strike}</td>
                        <td className="text-right pr-3">{c.dte}</td>
                        <td className="text-right pr-3 tabular-nums text-white">${c.mid.toFixed(2)}</td>
                        <td className={`text-right pr-3 tabular-nums ${c.spreadPct < 10 ? 'text-emerald-400' : c.spreadPct < 25 ? 'text-amber-400' : 'text-red-400'}`}>
                          {c.spreadPct.toFixed(1)}%
                        </td>
                        <td className="text-right pr-3 tabular-nums">{c.delta?.toFixed(3) ?? '—'}</td>
                        <td className="text-right tabular-nums text-slate-300">{c.rankScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
