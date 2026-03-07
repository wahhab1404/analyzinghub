'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users, FileText, TrendingUp, Activity, Target, UserPlus,
  Loader2, DollarSign, BarChart3, TrendingDown, Calendar,
  ArrowUpRight, ArrowDownRight, Minus, RefreshCw
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

function StatSkeleton() {
  return (
    <div className="stat-card">
      <div className="skeleton h-3 w-20 mb-3" />
      <div className="skeleton h-8 w-28 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  )
}

function TradeRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[hsl(var(--border)/0.5)] last:border-none">
      <div className="skeleton h-8 w-8 rounded" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-2 w-20" />
      </div>
      <div className="space-y-1 text-right">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-3 w-12" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null)
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState(false)

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.push('/login')
        } else {
          setUser(d.user)
          fetchTradeStats()
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [router])

  const fetchTradeStats = async () => {
    setStatsError(false)
    try {
      const res = await fetch('/api/dashboard/stats', {
        credentials: 'include',
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json()
        setTradeStats(data.summary)
        setRecentTrades(data.recentTrades)
        setChartData(data.chartData)
      } else {
        setStatsError(true)
      }
    } catch (error) {
      console.error('Failed to fetch trade stats:', error)
      setStatsError(true)
    } finally {
      setStatsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.loadingDashboard}</p>
      </div>
    )
  }

  if (!user) return null

  const stats = user.stats || {
    total_analyses: 0,
    active_analyses: 0,
    completed_analyses: 0,
    successful_analyses: 0,
    success_rate: 0,
    followers_count: 0,
    following_count: 0
  }

  const getWinRateClass = (rate: number) =>
    rate >= 70 ? 'win-rate-high' : rate >= 50 ? 'win-rate-mid' : 'win-rate-low'

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)

  // Stat cards config
  const analysisStats = [
    {
      label: t.dashboard.totalAnalyses,
      value: stats.total_analyses,
      icon: FileText,
      sub: t.dashboard.publishedAnalyses,
      accent: '#3b82f6',
    },
    {
      label: t.dashboard.activeAnalyses,
      value: stats.active_analyses,
      icon: Activity,
      sub: t.dashboard.currentlyActive,
      accent: '#f59e0b',
    },
    {
      label: t.dashboard.successful,
      value: stats.successful_analyses,
      icon: Target,
      sub: t.dashboard.hitTargets,
      accent: '#10b981',
    },
    {
      label: t.dashboard.successRate,
      value: `${stats.success_rate}%`,
      icon: TrendingUp,
      sub: stats.completed_analyses > 0
        ? `${stats.completed_analyses} ${t.dashboard.completed}`
        : t.dashboard.noCompleted,
      accent: stats.success_rate >= 70 ? '#10b981' : stats.success_rate >= 50 ? '#f59e0b' : '#ef4444',
      valueClass: getWinRateClass(stats.success_rate),
    },
    {
      label: t.dashboard.followers,
      value: stats.followers_count,
      icon: Users,
      sub: t.dashboard.usersFollowingYou,
      accent: '#8b5cf6',
    },
    {
      label: t.dashboard.following,
      value: stats.following_count,
      icon: UserPlus,
      sub: t.dashboard.analyzersYouFollow,
      accent: '#06b6d4',
    },
  ]

  return (
    <div className="space-y-6 p-6">
      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight welcome-gradient">
            {t.dashboard.welcomeBack}, {user.profile.full_name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t.dashboard.performanceOverview}
          </p>
        </div>
        <Link
          href={`/dashboard/profile/${user.id}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View profile <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* ── Analysis Stats Grid ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {analysisStats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={`/dashboard/profile/${user.id}`}>
              <div className="stat-card hover:border-[hsl(var(--primary)/0.4)] transition-all duration-200 cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <p className="stat-label">{stat.label}</p>
                  <Icon
                    className="h-3.5 w-3.5 opacity-50 group-hover:opacity-80 transition-opacity"
                    style={{ color: stat.accent }}
                  />
                </div>
                <p
                  className={cn('stat-value', stat.valueClass)}
                  style={!stat.valueClass ? { color: 'hsl(var(--foreground))' } : undefined}
                >
                  {stat.value}
                </p>
                <p className="stat-sub mt-1">{stat.sub}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Trade Performance Row ────────────────────────── */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
      ) : statsError ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card text-sm text-muted-foreground">
          <span>Failed to load trade statistics.</span>
          <button
            onClick={fetchTradeStats}
            className="flex items-center gap-1 text-primary hover:underline text-xs"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      ) : tradeStats && tradeStats.closedTrades > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Total P/L */}
          <div className="stat-card border-l-2" style={{ borderLeftColor: tradeStats.totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="stat-label">{t.dashboard.totalProfitLoss}</p>
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className={cn('stat-value trade-number', tradeStats.totalProfit >= 0 ? 'profit-positive' : 'profit-negative')}>
              {tradeStats.totalProfit >= 0 ? '+' : ''}{formatCurrency(tradeStats.totalProfit)}
            </p>
            <p className="stat-sub mt-1">{tradeStats.closedTrades} {t.dashboard.closedTrades}</p>
          </div>

          {/* Win Rate */}
          <div className="stat-card border-l-2" style={{ borderLeftColor: tradeStats.winRate >= 60 ? '#10b981' : tradeStats.winRate >= 40 ? '#f59e0b' : '#ef4444' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="stat-label">{t.dashboard.winRate}</p>
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className={cn('stat-value trade-number', getWinRateClass(tradeStats.winRate))}>
              {tradeStats.winRate}%
            </p>
            <p className="stat-sub mt-1">
              {tradeStats.winningTrades} {t.dashboard.winningOf} {tradeStats.closedTrades}
            </p>
          </div>

          {/* Month P/L */}
          <div className="stat-card border-l-2" style={{ borderLeftColor: '#8b5cf6' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="stat-label">{t.dashboard.thisMonth}</p>
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className={cn('stat-value trade-number', tradeStats.currentMonthProfit >= 0 ? 'profit-positive' : 'profit-negative')}>
              {tradeStats.currentMonthProfit >= 0 ? '+' : ''}{formatCurrency(tradeStats.currentMonthProfit)}
            </p>
            <p className="stat-sub mt-1">{t.dashboard.monthToDatePerformance}</p>
          </div>
        </div>
      ) : null}

      {/* ── Main content: Chart + Recent Trades ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Chart */}
        {chartData && chartData.length > 0 && (
          <Card className="lg:col-span-3 border-[hsl(var(--border))]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t.dashboard.last7DaysPerformance}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t.dashboard.dailyProfitLossTrend}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'P&L']}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#profitGrad)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#10b981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Recent trades */}
        {statsLoading ? (
          <Card className={cn('border-[hsl(var(--border))]', chartData?.length > 0 ? 'lg:col-span-2' : 'lg:col-span-5')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t.dashboard.last5ClosedTrades}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {[1,2,3].map(i => <TradeRowSkeleton key={i} />)}
            </CardContent>
          </Card>
        ) : recentTrades && recentTrades.length > 0 ? (
          <Card className={cn('border-[hsl(var(--border))]', chartData?.length > 0 ? 'lg:col-span-2' : 'lg:col-span-5')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                {t.dashboard.last5ClosedTrades}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div>
                {recentTrades.map((trade, idx) => {
                  const entryPrice = trade.entry_contract_snapshot?.mid ?? trade.entry_contract_snapshot?.last ?? 0
                  const qty = trade.qty ?? 1
                  const multiplier = trade.contract_multiplier ?? 100
                  const entryCost = entryPrice * qty * multiplier

                  let profit = 0
                  if (trade.computed_profit_usd != null) {
                    profit = trade.computed_profit_usd
                  } else if (trade.is_win === false) {
                    profit = -entryCost
                  }

                  const profitPercent = entryCost > 0 ? ((profit / entryCost) * 100) : 0
                  const isCall = trade.direction === 'call' || trade.direction === 'bullish'

                  return (
                    <Link
                      key={trade.id}
                      href="/dashboard/indices"
                      className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border)/0.5)] last:border-none hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
                    >
                      {/* Direction icon */}
                      <div className={cn(
                        'h-7 w-7 rounded flex items-center justify-center flex-shrink-0',
                        isCall ? 'bg-emerald-500/15' : 'bg-red-500/15'
                      )}>
                        {isCall
                          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        }
                      </div>

                      {/* Trade info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="ticker-chip">{trade.underlying_index_symbol}</span>
                          <span className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded-sm',
                            trade.is_win === true ? 'badge-win' : trade.is_win === false ? 'badge-loss' : 'badge-closed'
                          )}>
                            {trade.is_win === true ? 'WIN' : trade.is_win === false ? 'LOSS' : 'CLOSED'}
                          </span>
                        </div>
                        <p className="contract-info mt-0.5">
                          {trade.option_type?.toUpperCase()} ${trade.strike}{trade.expiry ? ` · ${new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                        </p>
                      </div>

                      {/* P&L */}
                      <div className="text-right flex-shrink-0">
                        <p className={cn('pnl-display text-sm', profit >= 0 ? 'positive' : 'negative')}>
                          {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                        </p>
                        <p className={cn('text-xs trade-number font-medium', profit >= 0 ? 'profit-positive' : 'profit-negative')}>
                          {profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(1)}%
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
              <div className="px-4 py-2 border-t border-[hsl(var(--border)/0.5)]">
                <Link
                  href="/dashboard/indices"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  View all trades <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* ── Performance summary + Quick actions ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Performance summary */}
        {stats.completed_analyses > 0 && (
          <Card className="border-[hsl(var(--border))]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t.dashboard.performanceSummary}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t.dashboard.completedAnalyses}{' '}
                <strong className="text-foreground">{stats.completed_analyses}</strong>{' '}
                {t.dashboard.analysesWith}{' '}
                <strong className="text-foreground">{stats.successful_analyses}</strong>{' '}
                {t.dashboard.successfullyHitting}
                {stats.success_rate >= 70 && (
                  <span className="ml-1 profit-positive font-semibold">{t.dashboard.excellentWork}</span>
                )}
                {stats.success_rate >= 50 && stats.success_rate < 70 && (
                  <span className="ml-1 text-amber-500 font-semibold">{t.dashboard.goodPerformance}</span>
                )}
                {stats.success_rate < 50 && (
                  <span className="ml-1 text-muted-foreground">{t.dashboard.keepLearning}</span>
                )}
              </p>

              {/* Win/loss visual bar */}
              {stats.completed_analyses > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Win rate</span>
                    <span className={getWinRateClass(stats.success_rate)}>{stats.success_rate}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${stats.success_rate}%`,
                        backgroundColor: stats.success_rate >= 70 ? '#10b981' : stats.success_rate >= 50 ? '#f59e0b' : '#ef4444'
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <Card className="border-[hsl(var(--border))]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.dashboard.quickActions}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground mb-3 font-medium">
                {t.dashboard.yourRole}: <span className="text-foreground font-semibold">{user.role}</span>
              </p>
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--muted))] transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                {t.dashboard.completeProfile}
              </Link>
              {user.role === 'Analyzer' && (
                <Link
                  href="/dashboard/create-analysis"
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--muted))] transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                  {t.dashboard.createFirstAnalysis}
                </Link>
              )}
              {user.role === 'Trader' && (
                <Link
                  href="/dashboard/search"
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--muted))] transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                  {t.dashboard.findAnalyzers}
                </Link>
              )}
              <Link
                href="/dashboard/feed"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--muted))] transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                {t.dashboard.exploreFeed}
              </Link>
              <Link
                href="/dashboard/indices"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-[hsl(var(--muted))] transition-colors text-muted-foreground hover:text-foreground"
              >
                <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0" />
                Indices Hub
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
