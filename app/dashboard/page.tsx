'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users, FileText, TrendingUp, Activity, Target, UserPlus, Loader2,
  DollarSign, BarChart3, TrendingDown, Calendar, ArrowUpRight, ArrowDownRight,
  Minus
} from 'lucide-react'
import { SessionUser } from '@/lib/auth/types'
import { useLanguage } from '@/lib/i18n/language-context'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface TradeStats {
  totalTrades: number
  activeTrades: number
  closedTrades: number
  winningTrades: number
  winRate: number
  totalProfit: number
  currentMonthProfit: number
}

interface RecentTrade {
  id: string
  status: string
  instrument_type: string
  direction: string
  underlying_index_symbol: string
  strike?: number
  expiry?: string
  option_type?: string
  computed_profit_usd?: number
  is_win?: boolean
  peak_price_after_entry?: number
  contract_high_since?: number
  closed_at?: string
  created_at: string
  entry_contract_snapshot?: any
  current_contract?: number
  qty?: number
  contract_multiplier?: number
}

interface ChartDataPoint {
  date: string
  profit: number
  trades: number
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d.user) { router.push('/login'); return }
        setUser(d.user)
        fetchTradeStats()
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false))
  }, [router])

  const fetchTradeStats = async () => {
    try {
      const res = await fetch('/api/dashboard/stats', { credentials: 'include', cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setTradeStats(data.summary)
        setRecentTrades(data.recentTrades)
        setChartData(data.chartData)
      }
    } catch {}
    finally { setStatsLoading(false) }
  }

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
    successful_analyses: 0, success_rate: 0, followers_count: 0, following_count: 0
  }

  const winRateColor = tradeStats
    ? tradeStats.winRate >= 60 ? 'text-emerald-500' : tradeStats.winRate >= 40 ? 'text-amber-500' : 'text-red-500'
    : ''

  const successRateColor = stats.success_rate >= 70
    ? 'text-emerald-500'
    : stats.success_rate >= 50 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="section-label mb-1">TERMINAL</p>
          <h1 className="text-lg font-bold text-foreground leading-none">
            {user.profile.full_name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t.dashboard.performanceOverview}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 border uppercase tracking-wide',
            user.role === 'Analyzer' ? 'badge-active' : 'badge-neutral'
          )}>
            {user.role}
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border rounded-sm overflow-hidden border border-border">
        {[
          {
            label: t.dashboard.totalAnalyses,
            value: stats.total_analyses,
            sub: t.dashboard.publishedAnalyses,
            icon: FileText,
          },
          {
            label: t.dashboard.activeAnalyses,
            value: stats.active_analyses,
            sub: t.dashboard.currentlyActive,
            icon: Activity,
            highlight: stats.active_analyses > 0 ? 'text-amber-500' : undefined,
          },
          {
            label: t.dashboard.successful,
            value: stats.successful_analyses,
            sub: t.dashboard.hitTargets,
            icon: Target,
            highlight: stats.successful_analyses > 0 ? 'text-emerald-500' : undefined,
          },
          {
            label: t.dashboard.successRate,
            value: `${stats.success_rate}%`,
            sub: `${stats.completed_analyses} ${t.dashboard.completed}`,
            icon: TrendingUp,
            highlight: successRateColor,
          },
          {
            label: t.dashboard.followers,
            value: formatCompact(stats.followers_count),
            sub: t.dashboard.usersFollowingYou,
            icon: Users,
          },
          {
            label: t.dashboard.following,
            value: stats.following_count,
            sub: t.dashboard.analyzersYouFollow,
            icon: UserPlus,
          },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <Link
              key={kpi.label}
              href={`/dashboard/profile/${user.id}`}
              className="bg-card p-3 flex flex-col gap-1 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="section-label">{kpi.label}</span>
                <Icon className="h-3 w-3 text-muted-foreground/50" />
              </div>
              <span className={cn('kpi-value text-xl', kpi.highlight ?? 'text-foreground')}>
                {kpi.value}
              </span>
              <span className="text-[10px] text-muted-foreground">{kpi.sub}</span>
            </Link>
          )
        })}
      </div>

      {/* Trade performance row */}
      {tradeStats && tradeStats.closedTrades > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Total P&L */}
          <Card className="terminal-card rounded-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="section-label flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" />
                {t.dashboard.totalProfitLoss}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-end gap-2">
                <span className={cn('kpi-value text-3xl', tradeStats.totalProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  {tradeStats.totalProfit >= 0 ? '+' : ''}{formatCurrency(tradeStats.totalProfit)}
                </span>
                {tradeStats.totalProfit >= 0
                  ? <ArrowUpRight className="h-4 w-4 text-emerald-500 mb-1" />
                  : <ArrowDownRight className="h-4 w-4 text-red-500 mb-1" />
                }
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {tradeStats.closedTrades} {t.dashboard.closedTrades}
              </p>
            </CardContent>
          </Card>

          {/* Win rate */}
          <Card className="terminal-card rounded-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="section-label flex items-center gap-1.5">
                <Target className="h-3 w-3" />
                {t.dashboard.winRate}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-end gap-2">
                <span className={cn('kpi-value text-3xl', winRateColor)}>
                  {tradeStats.winRate}%
                </span>
                <div className="mb-1 w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', tradeStats.winRate >= 60 ? 'bg-emerald-500' : tradeStats.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                    style={{ width: `${tradeStats.winRate}%` }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {tradeStats.winningTrades} {t.dashboard.winningOf} {tradeStats.closedTrades}
              </p>
            </CardContent>
          </Card>

          {/* This month */}
          <Card className="terminal-card rounded-sm">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="section-label flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {t.dashboard.thisMonth}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-end gap-2">
                <span className={cn('kpi-value text-3xl', tradeStats.currentMonthProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  {tradeStats.currentMonthProfit >= 0 ? '+' : ''}{formatCurrency(tradeStats.currentMonthProfit)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{t.dashboard.monthToDatePerformance}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart + Recent trades grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

        {/* P&L Chart */}
        {chartData && chartData.length > 0 && (
          <Card className="terminal-card rounded-sm lg:col-span-3">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border">
              <CardTitle className="section-label flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3" />
                {t.dashboard.last7DaysPerformance}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pt-3 pb-2">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 0, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.6} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}
                    tickFormatter={(v) => `$${v}`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '2px',
                      color: 'hsl(var(--foreground))',
                      fontSize: '11px',
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'P&L']}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#22c55e"
                    strokeWidth={1.5}
                    fill="url(#profitGrad)"
                    dot={false}
                    activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Recent trades table */}
        {recentTrades && recentTrades.length > 0 && (
          <Card className="terminal-card rounded-sm lg:col-span-2">
            <CardHeader className="pb-2 pt-3 px-4 border-b border-border">
              <CardTitle className="section-label flex items-center gap-1.5">
                <Activity className="h-3 w-3" />
                {t.dashboard.last5ClosedTrades}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-3 py-2 section-label font-semibold">SYMBOL</th>
                    <th className="text-left px-2 py-2 section-label font-semibold">DIR</th>
                    <th className="text-right px-3 py-2 section-label font-semibold">P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => {
                    const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0
                    const qty = trade.qty || 1
                    const multiplier = trade.contract_multiplier || 100
                    const entryCost = entryPrice * qty * multiplier
                    let profit = 0
                    if (trade.computed_profit_usd != null) {
                      profit = trade.computed_profit_usd
                    } else if (trade.is_win === false) {
                      profit = -entryCost
                    }
                    const isCall = trade.direction === 'call' || trade.direction === 'bullish'

                    return (
                      <tr key={trade.id} className="data-row">
                        <td className="px-3 py-2">
                          <div className="font-bold text-foreground">{trade.underlying_index_symbol}</div>
                          <div className="text-[10px] text-muted-foreground num">
                            {trade.option_type?.toUpperCase()} {trade.strike ? `$${trade.strike}` : ''}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span className={isCall ? 'badge-buy' : 'badge-sell'}>
                            {isCall ? 'CALL' : 'PUT'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className={cn('font-bold num', profit >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </div>
                          <div className={cn('text-[10px] num', profit >= 0 ? 'text-emerald-500/70' : 'text-red-500/70')}>
                            {trade.is_win === true ? 'WIN' : trade.is_win === false ? 'LOSS' : 'CLOSED'}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick actions panel */}
      <Card className="terminal-card rounded-sm">
        <CardHeader className="pb-2 pt-3 px-4 border-b border-border">
          <CardTitle className="section-label">{t.dashboard.gettingStarted}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2 p-2.5 border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors rounded-sm group"
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-medium">{t.dashboard.completeProfile}</span>
            </Link>
            {user.role === 'Analyzer' && (
              <Link
                href="/dashboard/create-analysis"
                className="flex items-center gap-2 p-2.5 border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors rounded-sm group"
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                <span className="text-xs font-medium">{t.dashboard.createFirstAnalysis}</span>
              </Link>
            )}
            {user.role === 'Trader' && (
              <Link
                href="/dashboard/search"
                className="flex items-center gap-2 p-2.5 border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors rounded-sm group"
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                <span className="text-xs font-medium">{t.dashboard.findAnalyzers}</span>
              </Link>
            )}
            <Link
              href="/dashboard/feed"
              className="flex items-center gap-2 p-2.5 border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors rounded-sm group"
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-medium">{t.dashboard.exploreFeed}</span>
            </Link>
            <Link
              href="/dashboard/rankings"
              className="flex items-center gap-2 p-2.5 border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors rounded-sm group"
            >
              <ArrowUpRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-xs font-medium">View Rankings</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
