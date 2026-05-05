'use client'

/**
 * components/spx/AnalyticsPanel.tsx
 *
 * Premium analytics panel showing performance metrics for SPX signals and trades.
 * Fetches from GET /api/spx/analytics?days={period}
 */

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, BarChart2, Activity, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  success: boolean
  period: { from: string; to: string; days: number }
  summary: {
    totalSignals: number
    actionableSignals: number
    totalTrades: number
    closedTrades: number
    openTrades: number
    winRate: number
    expectancy: number
    avgMFE: number
    avgMAE: number
    avgPremiumExpansion: number
    signalPrecision: number
    falsePosRate: number
  }
  byMode: Array<{
    mode: string
    signalCount: number
    tradeCount: number
    wins: number
    losses: number
    winRate: number
    avgPnl: number
  }>
  byConfidence: Array<{
    class: string
    signalCount: number
    tradeCount: number
    winRate: number
    avgPnl: number
  }>
  byHour: Array<{
    hour: number
    label: string
    signalCount: number
    tradeCount: number
    winRate: number
  }>
  byContractType: Array<{
    type: string
    count: number
    winRate: number
    avgPnl: number
  }>
  byDTERegime: Array<{
    regime: string
    count: number
    winRate: number
    avgPnl: number
  }>
  byScoreBucket: Array<{
    bucket: string
    min: number
    max: number
    signalCount: number
    tradeCount: number
    winRate: number
    avgPnl: number
  }>
  recentClosedTrades: {
    id: string
    date: string
    type: string
    mode: string
    score: number
    entryPremium: number
    exitPremium: number
    pnlPct: number
    outcome: string
  }[]
}

type Period = 7 | 14 | 30 | 90

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt1(n: number | null | undefined) { return (n ?? 0).toFixed(1) }
function fmt2(n: number | null | undefined) { return (n ?? 0).toFixed(2) }
function fmtPct(n: number | null | undefined) { return `${(n ?? 0).toFixed(1)}%` }
function fmtPnl(n: number | null | undefined) {
  const v = n ?? 0
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}`
}

function winRateColor(wr: number): string {
  if (wr >= 60) return 'bg-emerald-500'
  if (wr >= 50) return 'bg-blue-500'
  if (wr >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function winRateTextColor(wr: number): string {
  if (wr >= 60) return 'text-emerald-400'
  if (wr >= 50) return 'text-blue-400'
  if (wr >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function pnlColor(n: number): string {
  return n >= 0 ? 'text-emerald-400' : 'text-red-400'
}

const OUTCOME_BADGE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  big_win:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', label: 'Big Win' },
  small_win:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400',    label: 'Win' },
  breakeven:   { bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   text: 'text-slate-400',   label: 'B/E' },
  small_loss:  { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   label: 'Loss' },
  big_loss:    { bg: 'bg-red-500/10',     border: 'border-red-500/20',     text: 'text-red-400',     label: 'Big Loss' },
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const cfg = OUTCOME_BADGE[outcome] ?? { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400', label: outcome }
  return (
    <span className={`${cfg.bg} ${cfg.text} ${cfg.border} border rounded-full px-2 py-0.5 text-[10px] font-medium`}>
      {cfg.label}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: 'emerald' | 'red' | 'blue' | 'amber' | 'slate'
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400',
    red:     'text-red-400',
    blue:    'text-blue-400',
    amber:   'text-amber-400',
    slate:   'text-slate-300',
  }
  return (
    <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-3 flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</span>
      <span className={`text-xl font-bold font-mono tabular-nums leading-none ${colors[accent]}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-600">{sub}</span>}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{children}</div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#1a2840] bg-[#070e1a] p-4 ${className}`}>
      {children}
    </div>
  )
}

// Win rate bar
function WinBar({ rate, max = 100 }: { rate: number; max?: number }) {
  const pct = Math.min((rate / max) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#1a2840] overflow-hidden">
        <div
          className={`h-full rounded-full ${winRateColor(rate)} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[11px] font-mono w-10 text-right ${winRateTextColor(rate)}`}>
        {fmtPct(rate)}
      </span>
    </div>
  )
}

// CSS bar chart for signal activity by hour
function HourBar({ count, max, hour, label }: { count: number; max: number; hour: number; label: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  const isMarketHours = hour >= 9 && hour <= 16
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className="w-full flex items-end h-16">
        <div
          className={`w-full rounded-t transition-all ${isMarketHours ? 'bg-blue-500/60' : 'bg-slate-700/40'}`}
          style={{ height: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="text-[9px] text-slate-600 truncate w-full text-center">{label}</span>
    </div>
  )
}

// PnL bar (horizontal, bidirectional)
function PnlBar({ value, maxAbs }: { value: number; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.min(Math.abs(value) / maxAbs * 50, 50) : 0
  return (
    <div className="flex items-center h-3 w-24">
      <div className="flex-1 h-1.5 bg-[#1a2840] rounded-full relative overflow-hidden">
        <div
          className={`absolute top-0 h-full rounded-full ${value >= 0 ? 'bg-emerald-500/70 left-1/2' : 'bg-red-500/70 right-1/2'}`}
          style={{ width: `${pct * 2}%` }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600" />
      </div>
    </div>
  )
}

// Skeleton loader
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-20" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-48" />
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-48" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-48" />
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-48" />
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsPanel() {
  const [period, setPeriod] = useState<Period>(30)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/spx/analytics?days=${period}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: AnalyticsData) => setData(d))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [period])

  const PERIODS: Period[] = [7, 14, 30, 90]

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Performance Analytics</span>
          {data && (
            <span className="text-[10px] text-slate-600">
              {new Date(data.period.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {new Date(data.period.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-[#070e1a] border border-[#1a2840] rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button
            type="button"
            onClick={() => setPeriod(p => p)}
            className="ml-auto flex items-center gap-1 text-[11px] hover:text-red-300"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && !error && data && (() => {
        const s = data.summary

        // ── Pre-compute maxes for charts ──────────────────────────────────────
        const maxHourCount = Math.max(...data.byHour.map(h => h.signalCount), 1)
        const maxPnlAbs = Math.max(
          ...data.byMode.map(m => Math.abs(m.avgPnl)),
          ...data.byScoreBucket.map(b => Math.abs(b.avgPnl)),
          0.01,
        )

        return (
          <div className="space-y-4">

            {/* ── Row 1: KPI Summary Bar ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label="Win Rate"
                value={fmtPct(s.winRate)}
                sub={`${s.closedTrades} closed trades`}
                accent={s.winRate >= 50 ? 'emerald' : 'red'}
              />
              <KpiCard
                label="Expectancy"
                value={fmtPnl(s.expectancy)}
                sub="avg P&L / trade"
                accent={s.expectancy >= 0 ? 'emerald' : 'red'}
              />
              <KpiCard
                label="Avg MFE"
                value={`+${fmt2(s.avgMFE)}`}
                sub="max favorable exc."
                accent="emerald"
              />
              <KpiCard
                label="Avg MAE"
                value={`-${fmt2(Math.abs(s.avgMAE))}`}
                sub="max adverse exc."
                accent="red"
              />
              <KpiCard
                label="Signal Precision"
                value={fmtPct(s.signalPrecision)}
                sub={`${s.actionableSignals} of ${s.totalSignals} signals`}
                accent="blue"
              />
              <KpiCard
                label="False Pos. Rate"
                value={fmtPct(s.falsePosRate)}
                sub="signals not traded"
                accent={s.falsePosRate > 30 ? 'amber' : 'slate'}
              />
            </div>

            {/* ── Row 2: By Mode + By Confidence ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* By Mode */}
              <Card>
                <SectionHeader>Performance by Mode</SectionHeader>
                {data.byMode.length === 0 ? (
                  <EmptyState label="No mode data" />
                ) : (
                  <div className="space-y-1">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-[10px] text-slate-600 pb-1 border-b border-[#1a2840]">
                      <span>Mode</span>
                      <span className="text-right">Signals</span>
                      <span className="text-right">Trades</span>
                      <span className="w-28 text-right">Win Rate</span>
                      <span className="text-right">Avg P&L</span>
                    </div>
                    {data.byMode.map(row => (
                      <div key={row.mode} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center py-1">
                        <span className="text-[11px] text-slate-300 font-medium truncate">{row.mode}</span>
                        <span className="text-[11px] font-mono text-slate-400 text-right">{row.signalCount}</span>
                        <span className="text-[11px] font-mono text-slate-400 text-right">{row.tradeCount}</span>
                        <div className="w-28">
                          <WinBar rate={row.winRate} />
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <PnlBar value={row.avgPnl} maxAbs={maxPnlAbs} />
                          <span className={`text-[11px] font-mono w-14 text-right ${pnlColor(row.avgPnl)}`}>
                            {fmtPnl(row.avgPnl)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* By Confidence */}
              <Card>
                <SectionHeader>Performance by Confidence Class</SectionHeader>
                {data.byConfidence.length === 0 ? (
                  <EmptyState label="No confidence data" />
                ) : (
                  <div className="space-y-2">
                    {data.byConfidence.map(row => (
                      <div key={row.class} className="space-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold border ${
                              row.class === 'A' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : row.class === 'B' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                              : row.class === 'C' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>{row.class}</span>
                            <span className="text-[11px] text-slate-400">
                              {row.tradeCount} trades
                            </span>
                          </div>
                          <span className={`text-[11px] font-mono ${pnlColor(row.avgPnl)}`}>
                            {fmtPnl(row.avgPnl)} avg
                          </span>
                        </div>
                        <WinBar rate={row.winRate} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Row 3: By Hour + By Score Bucket ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* Signal Activity by Hour */}
              <Card>
                <SectionHeader>Signal Activity by Hour</SectionHeader>
                {data.byHour.length === 0 ? (
                  <EmptyState label="No hourly data" />
                ) : (
                  <>
                    <div className="flex items-end gap-0.5 h-20">
                      {data.byHour.map(h => (
                        <HourBar
                          key={h.hour}
                          count={h.signalCount}
                          max={maxHourCount}
                          hour={h.hour}
                          label={h.label}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-600">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-blue-500/60" />
                        Market hours (9am–4pm)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-slate-700/40" />
                        Off hours
                      </span>
                    </div>
                  </>
                )}
              </Card>

              {/* By Score Bucket */}
              <Card>
                <SectionHeader>Performance by Score Bucket</SectionHeader>
                {data.byScoreBucket.length === 0 ? (
                  <EmptyState label="No score bucket data" />
                ) : (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] text-slate-600 pb-1 border-b border-[#1a2840]">
                      <span>Score Range</span>
                      <span className="text-right">Trades</span>
                      <span className="w-28 text-right">Win Rate</span>
                      <span className="text-right">Avg P&L</span>
                    </div>
                    {data.byScoreBucket.map(row => (
                      <div key={row.bucket} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center py-0.5">
                        <span className="text-[11px] font-mono text-slate-400">{row.bucket}</span>
                        <span className="text-[11px] font-mono text-slate-400 text-right">{row.tradeCount}</span>
                        <div className="w-28">
                          <WinBar rate={row.winRate} />
                        </div>
                        <span className={`text-[11px] font-mono text-right ${pnlColor(row.avgPnl)}`}>
                          {fmtPnl(row.avgPnl)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Row 4: By Contract Type + By DTE Regime ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

              {/* By Contract Type */}
              <Card>
                <SectionHeader>By Contract Type</SectionHeader>
                {data.byContractType.length === 0 ? (
                  <EmptyState label="No contract type data" />
                ) : (
                  <div className="space-y-3">
                    {data.byContractType.map(row => (
                      <div key={row.type} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              row.type === 'CALL'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>{row.type}</span>
                            <span className="text-[11px] text-slate-500">{row.count} trades</span>
                          </div>
                          <span className={`text-[11px] font-mono ${pnlColor(row.avgPnl)}`}>
                            {fmtPnl(row.avgPnl)} avg P&L
                          </span>
                        </div>
                        <WinBar rate={row.winRate} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* By DTE Regime */}
              <Card>
                <SectionHeader>By DTE Regime</SectionHeader>
                {data.byDTERegime.length === 0 ? (
                  <EmptyState label="No DTE regime data" />
                ) : (
                  <div className="space-y-3">
                    {data.byDTERegime.map(row => (
                      <div key={row.regime} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 text-[10px] font-medium">
                              {row.regime}
                            </span>
                            <span className="text-[11px] text-slate-500">{row.count} trades</span>
                          </div>
                          <span className={`text-[11px] font-mono ${pnlColor(row.avgPnl)}`}>
                            {fmtPnl(row.avgPnl)} avg
                          </span>
                        </div>
                        <WinBar rate={row.winRate} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Row 5: Recent Closed Trades ── */}
            <Card>
              <SectionHeader>Recent Closed Trades</SectionHeader>
              {data.recentClosedTrades.length === 0 ? (
                <EmptyState label="No closed trades in this period" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-[#1a2840]">
                        <th className="text-left font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Date</th>
                        <th className="text-left font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Type</th>
                        <th className="text-left font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Mode</th>
                        <th className="text-right font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Score</th>
                        <th className="text-right font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Entry</th>
                        <th className="text-right font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">Exit</th>
                        <th className="text-right font-semibold text-slate-500 pb-2 pr-4 whitespace-nowrap">P&L %</th>
                        <th className="text-left font-semibold text-slate-500 pb-2 whitespace-nowrap">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentClosedTrades.slice(0, 10).map((t) => (
                        <tr
                          key={t.id}
                          className="border-b border-[#1a2840]/50 hover:bg-[#0d1726]/40 transition-colors"
                        >
                          <td className="py-1.5 pr-4 text-slate-500 font-mono whitespace-nowrap">
                            {formatDate(t.date)}
                          </td>
                          <td className="py-1.5 pr-4">
                            <span className={`font-semibold ${
                              t.type === 'CALL' ? 'text-emerald-400'
                              : t.type === 'PUT' ? 'text-red-400'
                              : 'text-slate-400'
                            }`}>
                              {t.type}
                            </span>
                          </td>
                          <td className="py-1.5 pr-4 text-slate-400 truncate max-w-[8rem]">{t.mode}</td>
                          <td className="py-1.5 pr-4 text-right">
                            <ScorePill score={t.score} />
                          </td>
                          <td className="py-1.5 pr-4 text-right font-mono text-slate-400">
                            {fmt2(t.entryPremium)}
                          </td>
                          <td className="py-1.5 pr-4 text-right font-mono text-slate-400">
                            {fmt2(t.exitPremium)}
                          </td>
                          <td className={`py-1.5 pr-4 text-right font-mono font-medium ${pnlColor(t.pnlPct)}`}>
                            {fmtPnl(t.pnlPct)}%
                          </td>
                          <td className="py-1.5">
                            <OutcomeBadge outcome={t.outcome} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

          </div>
        )
      })()}

      {/* Empty state when no data and not loading */}
      {!loading && !error && !data && (
        <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] p-12 flex flex-col items-center gap-3 text-slate-600">
          <Activity className="h-8 w-8" />
          <span className="text-sm">No analytics data available for this period.</span>
        </div>
      )}

    </div>
  )
}

// ─── Inline helpers ────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-[11px] text-slate-600">
      {label}
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 75 ? 'text-emerald-400'
    : score >= 60 ? 'text-blue-400'
    : score >= 45 ? 'text-amber-400'
    : 'text-red-400'
  return (
    <span className={`font-mono font-semibold ${color}`}>{score}</span>
  )
}
