'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Activity, TrendingUp, TrendingDown, Loader2, RefreshCw,
  Trophy, Target, BarChart3, DollarSign, Zap, ArrowUpRight,
  Users, FileText
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts'
import { SessionUser } from '@/lib/auth/types'
import { useLanguage } from '@/lib/i18n/language-context'

/* ─── Type definitions ──────────────────────────────────────────────────── */

interface PlatformStats {
  totalTrades: number
  activeTrades: number
  closedTrades: number
  winningTrades: number
  winRate: number
  totalProfit: number
  currentMonthProfit: number
}

interface Trade {
  id: string
  status: 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  direction: string
  underlying_index_symbol: string
  instrument_type: string
  option_type?: string
  strike?: number
  expiry?: string
  qty: number
  contract_multiplier: number | string
  entry_contract_snapshot: {
    mid: number
    last?: number
    implied_volatility?: number
    delta?: number
    theta?: number
  }
  entry_underlying_snapshot?: { price: number }
  current_contract: number
  contract_high_since: number
  contract_low_since?: number
  computed_profit_usd?: number
  is_win?: boolean
  entry_cost_usd: number
  created_at: string
  closed_at?: string
  published_at?: string
  targets?: Array<{ price: number; percentage: number; hit?: boolean }>
  stoploss?: { price: number; percentage: number }
  author: { id: string; full_name: string; avatar_url?: string }
  analysis?: { id: string; title: string }
}

interface LeaderboardRow {
  rank: number
  userId: string
  fullName: string
  avatarUrl?: string
  points: number
  qualityScore: number
  winRate?: number
  closedAnalyses?: number
  badges: Array<{ key: string; name: string; tier: string }>
}

interface Analysis {
  id: string
  index_symbol: string
  title: string
  status: string
  created_at: string
  published_at?: string
  active_trades_count: number
  trades_count: number
  author?: { id: string; full_name: string }
}

/* ─── Utility functions ─────────────────────────────────────────────────── */

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v)

const timeAgo = (d: string) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const multiplierOf = (t: Trade) =>
  typeof t.contract_multiplier === 'string'
    ? parseFloat(t.contract_multiplier)
    : (t.contract_multiplier || 100)

const computeOpenPnL = (trade: Trade) => {
  const entry = trade.entry_contract_snapshot?.mid || 0
  const current = trade.current_contract || 0
  const qty = trade.qty || 1
  const mult = multiplierOf(trade)
  const profit = (current - entry) * qty * mult
  const pct = entry > 0 ? ((current - entry) / entry) * 100 : 0
  return { profit, pct, entry, current }
}

/* ─── Small reusable UI pieces ──────────────────────────────────────────── */

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('text-[9px] font-black px-1.5 py-0.5 border tracking-widest', className)}>
      {children}
    </span>
  )
}

function StatusPill({ status, isWin }: { status: string; isWin?: boolean }) {
  if (status === 'active') return <Pill className="text-amber-500 bg-amber-500/10 border-amber-500/25">ACTIVE</Pill>
  if (status === 'tp_hit' || isWin === true) return <Pill className="text-emerald-500 bg-emerald-500/10 border-emerald-500/25">TARGET ✓</Pill>
  if (status === 'sl_hit' || isWin === false) return <Pill className="text-red-500 bg-red-500/10 border-red-500/25">STOPPED</Pill>
  if (status === 'canceled') return <Pill className="text-muted-foreground bg-muted/20 border-border">CANCELED</Pill>
  return <Pill className="text-muted-foreground bg-muted/20 border-border">CLOSED</Pill>
}

function DirPill({ dir }: { dir: string }) {
  const isCall = dir === 'call' || dir === 'long' || dir === 'bullish'
  return (
    <span className={cn('text-[9px] font-black px-1.5 py-0.5 border tracking-wide', isCall ? 'badge-buy' : 'badge-sell')}>
      {isCall ? 'CALL' : 'PUT'}
    </span>
  )
}

function PanelHeader({
  label, count, right, onRefresh, spinning,
}: {
  label: string
  count?: number
  right?: React.ReactNode
  onRefresh?: () => void
  spinning?: boolean
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10">
      <div className="flex items-center gap-2">
        <span className="section-label">{label}</span>
        {count !== undefined && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 border border-primary/20">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onRefresh && (
          <button onClick={onRefresh} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
            <RefreshCw className={cn('h-3 w-3', spinning && 'animate-spin')} />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-[10px] text-muted-foreground">
        {msg}
      </td>
    </tr>
  )
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/20">
        {cols.map(c => (
          <th key={c} className={cn('py-1.5 section-label text-[9px] font-bold', c.startsWith('_R') ? 'text-right px-3' : c.startsWith('_r') ? 'text-right px-2' : 'text-left px-2')}>
            {c.replace(/^_[Rr]/, '')}
          </th>
        ))}
      </tr>
    </thead>
  )
}

/* ─── Main dashboard component ──────────────────────────────────────────── */

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [user, setUser] = useState<SessionUser | null>(null)
  const [myStats, setMyStats] = useState<PlatformStats | null>(null)
  const [chartData, setChartData] = useState<Array<{ date: string; profit: number; trades: number }>>([])
  const [activeTrades, setActiveTrades] = useState<Trade[]>([])
  const [closedTrades, setClosedTrades] = useState<Trade[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchTrades = useCallback(async () => {
    const [aRes, cRes] = await Promise.all([
      fetch('/api/indices/trades?status=active&limit=40', { credentials: 'include', cache: 'no-store' }),
      fetch('/api/indices/trades?status=closed&limit=12', { credentials: 'include', cache: 'no-store' }),
    ])
    if (aRes.ok) setActiveTrades((await aRes.json()).trades || [])
    if (cRes.ok) setClosedTrades((await cRes.json()).trades || [])
    setLastRefresh(new Date())
  }, [])

  const loadAll = useCallback(async () => {
    try {
      const [meRes, statsRes, lbRes, analysesRes] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/dashboard/stats', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/leaderboards?type=analyst&scope=all_time', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/indices/analyses?limit=10', { credentials: 'include', cache: 'no-store' }),
      ])

      const meData = await meRes.json()
      if (!meData.user) { router.push('/login'); return }
      setUser(meData.user)

      if (statsRes.ok) {
        const d = await statsRes.json()
        setMyStats(d.summary)
        setChartData(d.chartData || [])
      }
      if (lbRes.ok) {
        const d = await lbRes.json()
        setLeaderboard((d.rows || []).slice(0, 10))
      }
      if (analysesRes.ok) {
        const d = await analysesRes.json()
        setAnalyses(d.analyses || [])
      }

      await fetchTrades()
    } catch {
      router.push('/login')
    } finally {
      setLoading(false)
    }
  }, [router, fetchTrades])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchTrades()
    setRefreshing(false)
  }

  useEffect(() => { loadAll() }, [loadAll])

  /* ── Loading state ───────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!user) return null

  const stats = user.stats || {
    total_analyses: 0, active_analyses: 0, completed_analyses: 0,
    successful_analyses: 0, success_rate: 0, followers_count: 0, following_count: 0,
  }

  /* ── Derived platform metrics from live trades ───────────────────────── */
  const callCount = activeTrades.filter(t => t.direction === 'call' || t.direction === 'long' || t.direction === 'bullish').length
  const putCount = activeTrades.filter(t => t.direction === 'put' || t.direction === 'short' || t.direction === 'bearish').length
  const isBullish = callCount >= putCount
  const sentimentPct = activeTrades.length > 0 ? ((callCount / activeTrades.length) * 100) : 50
  const liveAnalysts = new Set(activeTrades.map(t => t.author?.id)).size

  // Symbol heatmap
  const symMap = new Map<string, { calls: number; puts: number; total: number }>()
  activeTrades.forEach(t => {
    const s = t.underlying_index_symbol
    const prev = symMap.get(s) || { calls: 0, puts: 0, total: 0 }
    const bull = t.direction === 'call' || t.direction === 'long'
    symMap.set(s, { calls: prev.calls + (bull ? 1 : 0), puts: prev.puts + (bull ? 0 : 1), total: prev.total + 1 })
  })
  const symList = Array.from(symMap.entries())
    .map(([sym, d]) => ({ sym, ...d, bullish: d.calls >= d.puts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // Options-only subset
  const optionTrades = activeTrades.filter(t => t.instrument_type === 'options' || !!t.strike)

  /* ── KPI strip values ───────────────────────────────────────────────── */
  const kpiStrip = [
    {
      label: 'LIVE POSITIONS',
      value: activeTrades.length,
      sub: `${callCount}C · ${putCount}P`,
      icon: Activity,
      hl: activeTrades.length > 0 ? 'text-amber-500' : 'text-muted-foreground',
    },
    {
      label: 'WIN RATE',
      value: `${myStats?.winRate ?? 0}%`,
      sub: `${myStats?.winningTrades ?? 0} wins / ${myStats?.closedTrades ?? 0} closed`,
      icon: Target,
      hl: (myStats?.winRate ?? 0) >= 60 ? 'text-emerald-500' : (myStats?.winRate ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500',
    },
    {
      label: 'TOTAL P&L',
      value: fmt$(myStats?.totalProfit ?? 0),
      sub: 'All-time realized',
      icon: DollarSign,
      hl: (myStats?.totalProfit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500',
    },
    {
      label: 'MTD P&L',
      value: fmt$(myStats?.currentMonthProfit ?? 0),
      sub: 'Month-to-date',
      icon: BarChart3,
      hl: (myStats?.currentMonthProfit ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500',
    },
    {
      label: 'ANALYSTS LIVE',
      value: liveAnalysts,
      sub: `${activeTrades.length} total signals`,
      icon: Users,
      hl: liveAnalysts > 0 ? 'text-blue-400' : 'text-muted-foreground',
    },
    {
      label: 'MY ANALYSES',
      value: stats.total_analyses,
      sub: `${stats.success_rate}% success rate`,
      icon: FileText,
      hl: 'text-foreground',
    },
  ]

  return (
    <div className="space-y-3">

      {/* ════════════════════════════════════════════════════════════════
          PLATFORM KPI STRIP
      ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px bg-border border border-border overflow-hidden">
        {kpiStrip.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-card px-3 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="section-label">{k.label}</span>
                <Icon className="h-3 w-3 text-muted-foreground/40" />
              </div>
              <span className={cn('text-xl font-black num leading-none', k.hl)}>{k.value}</span>
              <span className="text-[10px] text-muted-foreground num leading-none">{k.sub}</span>
            </div>
          )
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MAIN TERMINAL GRID  (left 3 | center 5 | right 4)
      ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">

        {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">

          {/* Market Sentiment */}
          <div className="terminal-card">
            <PanelHeader label="MARKET SENTIMENT" />
            <div className="p-3 space-y-3">
              {/* Dial + number */}
              <div className="flex items-center justify-between">
                <span className={cn('text-xs font-black tracking-wide', isBullish ? 'text-emerald-500' : 'text-red-500')}>
                  {isBullish ? '▲ BULLISH' : '▼ BEARISH'}
                </span>
                <span className={cn('text-2xl font-black num', isBullish ? 'text-emerald-500' : 'text-red-500')}>
                  {sentimentPct.toFixed(0)}%
                </span>
              </div>
              {/* Gauge bar */}
              <div className="h-2 bg-muted overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${sentimentPct}%` }} />
                <div className="h-full bg-red-500 flex-1" />
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] font-bold text-emerald-500 num">{callCount} BULL</span>
                <span className="text-[10px] text-muted-foreground">|</span>
                <span className="text-[10px] font-bold text-red-500 num">{putCount} BEAR</span>
              </div>

              {/* Key stats */}
              <div className="border-t border-border pt-2 space-y-1.5">
                <p className="section-label mb-1">PLATFORM ACTIVITY</p>
                {[
                  { label: 'Analysts Live', value: liveAnalysts, color: 'text-blue-400' },
                  { label: 'Active Signals', value: activeTrades.length, color: 'text-amber-500' },
                  { label: 'Win Rate', value: `${myStats?.winRate ?? 0}%`, color: (myStats?.winRate ?? 0) >= 60 ? 'text-emerald-500' : 'text-amber-500' },
                  { label: 'Symbols Tracked', value: symList.length, color: 'text-foreground' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground">{row.label}</span>
                    <span className={cn('text-xs font-bold num', row.color)}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Symbol Heatmap */}
          <div className="terminal-card">
            <PanelHeader label="SYMBOL ACTIVITY" count={symList.length} />
            {symList.length === 0 ? (
              <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">No active signals</div>
            ) : (
              <div className="divide-y divide-border/50">
                {symList.map(({ sym, calls, puts, total, bullish }) => (
                  <div key={sym} className="flex items-center px-3 py-2 gap-3 hover:bg-muted/20 transition-colors">
                    {/* Mini bar chart */}
                    <div className="flex-shrink-0 flex flex-col justify-center gap-0.5">
                      <div className="h-2 w-12 bg-muted overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${total > 0 ? (calls / total) * 100 : 50}%` }}
                        />
                        <div className="h-full bg-red-500 flex-1" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-foreground">{sym}</span>
                        <span className={cn('text-[9px] font-bold', bullish ? 'text-emerald-500' : 'text-red-500')}>
                          {bullish ? '▲' : '▼'}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground num">
                        <span className="text-emerald-500/80">{calls}C</span>
                        {' / '}
                        <span className="text-red-500/80">{puts}P</span>
                        {' · '}
                        {total} total
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My Performance (Analyzer only) */}
          {user.role === 'Analyzer' && (
            <div className="terminal-card">
              <PanelHeader label="MY PERFORMANCE" />
              <div className="divide-y divide-border/50">
                {[
                  { label: 'Total Analyses', value: stats.total_analyses, color: 'text-foreground' },
                  { label: 'Active', value: stats.active_analyses, color: stats.active_analyses > 0 ? 'text-amber-500' : 'text-muted-foreground' },
                  { label: 'Successful', value: stats.successful_analyses, color: 'text-emerald-500' },
                  { label: 'Success Rate', value: `${stats.success_rate}%`, color: stats.success_rate >= 70 ? 'text-emerald-500' : stats.success_rate >= 50 ? 'text-amber-500' : 'text-red-500' },
                  { label: 'Followers', value: stats.followers_count, color: 'text-blue-400' },
                  { label: 'Following', value: stats.following_count, color: 'text-muted-foreground' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">{row.label}</span>
                    <span className={cn('text-xs font-bold num', row.color)}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border px-3 py-2">
                <Link href={`/dashboard/profile/${user.id}`} className="text-[10px] text-primary hover:underline">
                  Full profile →
                </Link>
              </div>
            </div>
          )}

          {/* 7-day P&L sparkline */}
          {chartData.length > 0 && (
            <div className="terminal-card">
              <PanelHeader label="7-DAY P&L TREND" />
              <div className="p-2 pt-3">
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sparkG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '2px',
                        fontSize: '10px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(v: any) => [fmt$(v), 'P&L']}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      fill="url(#sparkG)"
                      dot={false}
                      activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                {/* Day labels row */}
                <div className="flex justify-between px-1 mt-1">
                  {chartData.map(d => (
                    <span key={d.date} className="text-[8px] text-muted-foreground/60">{d.date.replace(/[A-Za-z]+ /, '')}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER PANEL ─────────────────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-3">

          {/* LIVE POSITIONS TABLE */}
          <div className="terminal-card">
            <PanelHeader
              label="LIVE POSITIONS"
              count={activeTrades.length}
              onRefresh={handleRefresh}
              spinning={refreshing}
              right={
                <span className="text-[9px] text-muted-foreground num">
                  {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-3 py-1.5 section-label text-[9px]">SYMBOL / ANALYST</th>
                    <th className="text-left px-2 py-1.5 section-label text-[9px]">DIR</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">ENTRY</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">CURRENT</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">HIGH</th>
                    <th className="text-right px-3 py-1.5 section-label text-[9px]">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTrades.length === 0
                    ? <EmptyRow cols={6} msg="No active positions on the platform" />
                    : activeTrades.map(trade => {
                        const { pct, entry, current } = computeOpenPnL(trade)
                        const high = trade.contract_high_since || current
                        const highPct = entry > 0 ? ((high - entry) / entry) * 100 : 0

                        return (
                          <tr key={trade.id} className="data-row">
                            <td className="px-3 py-2">
                              <div className="font-black text-foreground leading-none">{trade.underlying_index_symbol}</div>
                              <div className="text-[9px] text-muted-foreground mt-0.5 leading-none">
                                {trade.author?.full_name?.split(' ')[0]} · {timeAgo(trade.created_at)}
                              </div>
                            </td>
                            <td className="px-2 py-2"><DirPill dir={trade.direction} /></td>
                            <td className="px-2 py-2 text-right">
                              <span className="num text-muted-foreground">${entry.toFixed(2)}</span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className={cn('num font-semibold', current > entry ? 'text-emerald-500' : current < entry ? 'text-red-500' : 'text-foreground')}>
                                ${current.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="num text-emerald-500/80 leading-none">${high.toFixed(2)}</div>
                              <div className="text-[9px] text-emerald-500/60 num leading-none">+{highPct.toFixed(0)}%</div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn('num font-black text-sm', pct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
            <div className="px-3 py-1.5 border-t border-border bg-muted/10 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[9px] text-muted-foreground">Live — refreshed every visit</span>
              </div>
              <Link href="/dashboard/indices" className="text-[10px] text-primary hover:underline">View all →</Link>
            </div>
          </div>

          {/* OPTIONS ACTIVITY TABLE */}
          <div className="terminal-card">
            <PanelHeader label="OPTIONS ACTIVITY" count={optionTrades.length} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-3 py-1.5 section-label text-[9px]">UNDERLYING</th>
                    <th className="text-left px-2 py-1.5 section-label text-[9px]">OPT</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">STRIKE</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">EXPIRY</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">ENTRY $</th>
                    <th className="text-right px-2 py-1.5 section-label text-[9px]">CURR $</th>
                    <th className="text-right px-3 py-1.5 section-label text-[9px]">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {optionTrades.length === 0
                    ? <EmptyRow cols={7} msg="No options positions" />
                    : optionTrades.map(trade => {
                        const { pct, entry, current } = computeOpenPnL(trade)
                        const iv = trade.entry_contract_snapshot?.implied_volatility
                        const delta = trade.entry_contract_snapshot?.delta
                        const expDate = trade.expiry
                          ? new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                          : '—'

                        return (
                          <tr key={trade.id} className="data-row">
                            <td className="px-3 py-2">
                              <div className="font-black text-foreground leading-none">{trade.underlying_index_symbol}</div>
                              {iv && <div className="text-[9px] text-muted-foreground num leading-none">IV {(iv * 100).toFixed(1)}%{delta ? ` · Δ${delta.toFixed(2)}` : ''}</div>}
                            </td>
                            <td className="px-2 py-2">
                              <DirPill dir={trade.option_type || trade.direction} />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className="num font-semibold text-foreground">
                                {trade.strike ? `$${trade.strike.toLocaleString()}` : '—'}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className="num text-muted-foreground text-[10px]">{expDate}</span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className="num text-muted-foreground">${entry.toFixed(2)}</span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className={cn('num font-semibold', current > entry ? 'text-emerald-500' : 'text-red-500')}>
                                ${current.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={cn('num font-black text-sm', pct >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* RECENT CLOSED TRADES */}
          {closedTrades.length > 0 && (
            <div className="terminal-card">
              <PanelHeader label="RECENT CLOSED TRADES" count={closedTrades.length} />
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[480px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-3 py-1.5 section-label text-[9px]">SYMBOL</th>
                      <th className="text-left px-2 py-1.5 section-label text-[9px]">DIR</th>
                      <th className="text-left px-2 py-1.5 section-label text-[9px]">OUTCOME</th>
                      <th className="text-right px-2 py-1.5 section-label text-[9px]">ENTRY</th>
                      <th className="text-right px-2 py-1.5 section-label text-[9px]">P&L $</th>
                      <th className="text-right px-3 py-1.5 section-label text-[9px]">CLOSED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedTrades.map(trade => {
                      const entryMid = trade.entry_contract_snapshot?.mid || 0
                      const qty = trade.qty || 1
                      const mult = multiplierOf(trade)
                      const entryCost = entryMid * qty * mult
                      const profit = trade.computed_profit_usd ?? (trade.is_win === false ? -entryCost : 0)

                      return (
                        <tr key={trade.id} className="data-row">
                          <td className="px-3 py-2">
                            <span className="font-black text-foreground">{trade.underlying_index_symbol}</span>
                          </td>
                          <td className="px-2 py-2"><DirPill dir={trade.direction} /></td>
                          <td className="px-2 py-2"><StatusPill status={trade.status} isWin={trade.is_win} /></td>
                          <td className="px-2 py-2 text-right">
                            <span className="num text-muted-foreground">${entryMid.toFixed(2)}</span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className={cn('num font-bold', profit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                              {profit >= 0 ? '+' : ''}{fmt$(profit)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-[9px] text-muted-foreground num">
                              {trade.closed_at ? timeAgo(trade.closed_at) : '—'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-3">

          {/* ANALYST LEADERBOARD */}
          <div className="terminal-card">
            <PanelHeader label="ANALYST LEADERBOARD" />
            <div className="divide-y divide-border/50">
              {leaderboard.length === 0 ? (
                <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">No ranking data</div>
              ) : leaderboard.map(row => (
                <Link
                  key={row.userId}
                  href={`/dashboard/profile/${row.userId}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20 transition-colors group"
                >
                  {/* Rank indicator */}
                  <div className={cn(
                    'w-5 text-center text-xs font-black flex-shrink-0',
                    row.rank === 1 ? 'text-amber-400' : row.rank === 2 ? 'text-slate-400' : row.rank === 3 ? 'text-amber-600' : 'text-muted-foreground'
                  )}>
                    {row.rank <= 3 ? ['🥇','🥈','🥉'][row.rank - 1] : `#${row.rank}`}
                  </div>

                  {/* Name + stats */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {row.fullName}
                      </span>
                      {row.badges?.[0] && (
                        <Pill className="text-primary bg-primary/10 border-primary/20 hidden xs:inline">
                          {row.badges[0].tier.toUpperCase()}
                        </Pill>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{row.closedAnalyses ?? 0} trades</span>
                      {row.winRate !== undefined && (
                        <span className={cn('text-[9px] font-bold num',
                          row.winRate >= 60 ? 'text-emerald-500' : row.winRate >= 40 ? 'text-amber-500' : 'text-red-500'
                        )}>
                          {row.winRate.toFixed(0)}% WR
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-black text-primary num">{row.points.toLocaleString()}</div>
                    <div className="text-[9px] text-muted-foreground">pts</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="border-t border-border px-3 py-2 flex justify-between items-center">
              <span className="text-[9px] text-muted-foreground">Updated daily</span>
              <Link href="/dashboard/rankings" className="text-[10px] text-primary hover:underline">Full rankings →</Link>
            </div>
          </div>

          {/* ANALYST ACTIVITY FEED */}
          <div className="terminal-card">
            <PanelHeader label="ANALYST ACTIVITY" count={analyses.length} />
            <div className="divide-y divide-border/50">
              {analyses.length === 0 ? (
                <div className="px-3 py-5 text-center text-[10px] text-muted-foreground">No recent analyses</div>
              ) : analyses.map(analysis => (
                <Link
                  key={analysis.id}
                  href="/dashboard/indices"
                  className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20 transition-colors"
                >
                  {/* Symbol pill */}
                  <div className="flex-shrink-0 w-9 h-7 border border-border bg-muted/20 flex items-center justify-center">
                    <span className="text-[8px] font-black text-foreground leading-none text-center">
                      {analysis.index_symbol}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold text-foreground truncate leading-snug">
                      {analysis.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">
                        {analysis.author?.full_name?.split(' ')[0]}
                      </span>
                      {analysis.active_trades_count > 0 && (
                        <span className="text-[9px] text-amber-500 font-bold">
                          {analysis.active_trades_count} LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[9px] text-muted-foreground num flex-shrink-0">
                    {timeAgo(analysis.created_at)}
                  </span>
                </Link>
              ))}
            </div>
            <div className="border-t border-border px-3 py-2 flex justify-between items-center">
              <span className="text-[9px] text-muted-foreground">{analyses.reduce((s, a) => s + a.active_trades_count, 0)} active signals total</span>
              <Link href="/dashboard/feed" className="text-[10px] text-primary hover:underline">Full feed →</Link>
            </div>
          </div>

          {/* PERFORMANCE METRICS PANEL */}
          <div className="terminal-card">
            <PanelHeader label="PERFORMANCE METRICS" />
            <div className="p-3 space-y-3">
              {/* Win rate bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="section-label">WIN RATE</span>
                  <span className={cn('text-sm font-black num', (myStats?.winRate ?? 0) >= 60 ? 'text-emerald-500' : (myStats?.winRate ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500')}>
                    {myStats?.winRate ?? 0}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted overflow-hidden">
                  <div
                    className={cn('h-full transition-all', (myStats?.winRate ?? 0) >= 60 ? 'bg-emerald-500' : (myStats?.winRate ?? 0) >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${myStats?.winRate ?? 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-muted-foreground">0%</span>
                  <span className="text-[9px] text-muted-foreground">100%</span>
                </div>
              </div>

              {/* Key metrics grid */}
              <div className="grid grid-cols-2 gap-px bg-border border border-border overflow-hidden">
                {[
                  { label: 'TOTAL TRADES', value: myStats?.totalTrades ?? 0 },
                  { label: 'WINNING', value: myStats?.winningTrades ?? 0, color: 'text-emerald-500' },
                  { label: 'CLOSED', value: myStats?.closedTrades ?? 0 },
                  { label: 'ACTIVE', value: myStats?.activeTrades ?? 0, color: 'text-amber-500' },
                ].map(m => (
                  <div key={m.label} className="bg-card p-2">
                    <p className="section-label">{m.label}</p>
                    <p className={cn('text-base font-black num', m.color ?? 'text-foreground')}>{m.value}</p>
                  </div>
                ))}
              </div>

              {/* P&L summary */}
              <div className="space-y-1.5 border-t border-border pt-2">
                <p className="section-label">P&L SUMMARY</p>
                {[
                  { label: 'All-time P&L', value: fmt$(myStats?.totalProfit ?? 0), pos: (myStats?.totalProfit ?? 0) >= 0 },
                  { label: 'This Month', value: fmt$(myStats?.currentMonthProfit ?? 0), pos: (myStats?.currentMonthProfit ?? 0) >= 0 },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground">{row.label}</span>
                    <span className={cn('text-xs font-bold num', row.pos ? 'text-emerald-500' : 'text-red-500')}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="terminal-card">
            <PanelHeader label="QUICK ACTIONS" />
            <div className="p-3 grid grid-cols-2 gap-1.5">
              {[
                { label: 'Indices Hub', href: '/dashboard/indices', icon: BarChart3 },
                { label: 'Feed', href: '/dashboard/feed', icon: TrendingUp },
                { label: 'Rankings', href: '/dashboard/rankings', icon: Trophy },
                ...(user.role !== 'Trader' ? [{ label: 'New Analysis', href: '/dashboard/create-analysis', icon: Zap }] : []),
                { label: 'My Profile', href: `/dashboard/profile/${user.id}`, icon: Users },
                { label: 'Settings', href: '/dashboard/settings', icon: ArrowUpRight },
              ].map(action => {
                const Icon = action.icon
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-1.5 p-2 border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                  >
                    <Icon className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                      {action.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
