'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, TrendingUp, Activity, Target, UserPlus, Loader2, DollarSign, BarChart3, TrendingDown, Calendar } from 'lucide-react'
import { SessionUser } from '@/lib/auth/types'
import { useLanguage } from '@/lib/i18n/language-context'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'

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
    try {
      const res = await fetch('/api/dashboard/stats')
      if (res.ok) {
        const data = await res.json()
        setTradeStats(data.summary)
        setRecentTrades(data.recentTrades)
        setChartData(data.chartData)
      }
    } catch (error) {
      console.error('Failed to fetch trade stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t.dashboard.loadingDashboard}</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const stats = user.stats || {
    total_analyses: 0,
    active_analyses: 0,
    completed_analyses: 0,
    successful_analyses: 0,
    success_rate: 0,
    followers_count: 0,
    following_count: 0
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600 dark:text-green-400'
    if (rate >= 50) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const getTradeOutcomeBadge = (isWin?: boolean) => {
    if (isWin === true) {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    } else if (isWin === false) {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200'
  }

  const getTradeOutcomeLabel = (isWin?: boolean) => {
    if (isWin === true) return 'WIN'
    if (isWin === false) return 'LOSS'
    return 'CLOSED'
  }

  const statCards = [
    {
      title: t.dashboard.totalAnalyses,
      value: stats.total_analyses,
      icon: FileText,
      description: t.dashboard.publishedAnalyses,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-950',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.activeAnalyses,
      value: stats.active_analyses,
      icon: Activity,
      description: t.dashboard.currentlyActive,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-950',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.successful,
      value: stats.successful_analyses,
      icon: Target,
      description: t.dashboard.hitTargets,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-950',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.successRate,
      value: `${stats.success_rate}%`,
      icon: TrendingUp,
      description: stats.completed_analyses > 0 ? `${stats.completed_analyses} ${t.dashboard.completed}` : t.dashboard.noCompleted,
      color: getSuccessRateColor(stats.success_rate),
      bgColor: stats.success_rate >= 70 ? 'bg-green-100 dark:bg-green-950' : stats.success_rate >= 50 ? 'bg-yellow-100 dark:bg-yellow-950' : 'bg-red-100 dark:bg-red-950',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.followers,
      value: stats.followers_count,
      icon: Users,
      description: t.dashboard.usersFollowingYou,
      color: 'text-pink-600 dark:text-pink-400',
      bgColor: 'bg-pink-100 dark:bg-pink-950',
      link: `/dashboard/profile/${user.id}`
    },
    {
      title: t.dashboard.following,
      value: stats.following_count,
      icon: UserPlus,
      description: t.dashboard.analyzersYouFollow,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-100 dark:bg-cyan-950',
      link: `/dashboard/profile/${user.id}`
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
            {t.dashboard.welcomeBack} {user.profile.full_name}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
            {t.dashboard.performanceOverview}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.title} href={stat.link}>
              <Card className="hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer border-2 hover:border-primary/50 overflow-hidden group">
                <div className={`absolute top-0 right-0 w-32 h-32 ${stat.bgColor} rounded-full -mr-16 -mt-16 opacity-20 group-hover:opacity-30 transition-opacity`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wide">
                    {stat.title}
                  </CardTitle>
                  <div className={`h-12 w-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className={`text-3xl font-bold ${stat.title === 'Success Rate' ? stat.color : 'text-slate-900 dark:text-slate-50'}`}>
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {tradeStats && tradeStats.closedTrades > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                <DollarSign className="h-5 w-5" />
                {t.dashboard.totalProfitLoss}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${tradeStats.totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(tradeStats.totalProfit)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {tradeStats.closedTrades} {t.dashboard.closedTrades}
              </p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
                <TrendingUp className="h-5 w-5" />
                {t.dashboard.winRate}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${tradeStats.winRate >= 60 ? 'text-green-600 dark:text-green-400' : tradeStats.winRate >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {tradeStats.winRate}%
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {tradeStats.winningTrades} {t.dashboard.winningOf} {tradeStats.closedTrades} {t.dashboard.total}
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-900 dark:text-purple-100">
                <Calendar className="h-5 w-5" />
                {t.dashboard.thisMonth}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${tradeStats.currentMonthProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(tradeStats.currentMonthProfit)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {t.dashboard.monthToDatePerformance}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData && chartData.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t.dashboard.last7DaysPerformance}
            </CardTitle>
            <CardDescription>{t.dashboard.dailyProfitLossTrend}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any) => [`$${value.toFixed(2)}`, 'Profit']}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorProfit)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {recentTrades && recentTrades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t.dashboard.last5ClosedTrades}
            </CardTitle>
            <CardDescription>{t.dashboard.mostRecentCompletedTrades}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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

                const profitPercent = entryCost > 0 ? ((profit / entryCost) * 100).toFixed(1) : '0'

                return (
                  <Link
                    key={trade.id}
                    href={`/dashboard/indices`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border-2 hover:border-primary/50 transition-all hover:shadow-md bg-slate-50 dark:bg-slate-900/50">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center ${trade.direction === 'call' || trade.direction === 'bullish' ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'}`}>
                          {trade.direction === 'call' || trade.direction === 'bullish' ? (
                            <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                          ) : (
                            <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-slate-900 dark:text-slate-50">
                              {trade.underlying_index_symbol}
                            </h4>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTradeOutcomeBadge(trade.is_win)}`}>
                              {getTradeOutcomeLabel(trade.is_win)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {trade.option_type?.toUpperCase()} ${trade.strike} • Exp: {new Date(trade.expiry || '').toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                        </p>
                        <p className={`text-sm font-medium ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {profit >= 0 ? '+' : ''}{profitPercent}%
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {stats.completed_analyses > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/80 to-cyan-50/80 dark:from-blue-950/50 dark:to-cyan-950/50">
          <CardHeader>
            <CardTitle className="text-blue-900 dark:text-blue-100">{t.dashboard.performanceSummary}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {t.dashboard.completedAnalyses} <strong>{stats.completed_analyses}</strong> {t.dashboard.analysesWith}{' '}
              <strong>{stats.successful_analyses}</strong> {t.dashboard.successfullyHitting}
              {stats.success_rate >= 70 && ` ${t.dashboard.excellentWork}`}
              {stats.success_rate >= 50 && stats.success_rate < 70 && ` ${t.dashboard.goodPerformance}`}
              {stats.success_rate < 50 && ` ${t.dashboard.keepLearning}`}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.dashboard.gettingStarted}</CardTitle>
          <CardDescription>
            {t.dashboard.welcomePlatform}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {t.dashboard.yourRole} {user.role}
            </h3>
            {user.role === 'SuperAdmin' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.superAdminRole}
              </p>
            )}
            {user.role === 'Analyzer' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.analyzerRole}
              </p>
            )}
            {user.role === 'Trader' && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.dashboard.traderRole}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-50">
              {t.dashboard.quickActions}
            </h3>
            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>
                <Link href="/dashboard/settings" className="text-blue-600 hover:underline">
                  {t.dashboard.completeProfile}
                </Link>
              </li>
              {user.role === 'Analyzer' && (
                <li>
                  <Link href="/dashboard/create-analysis" className="text-blue-600 hover:underline">
                    {t.dashboard.createFirstAnalysis}
                  </Link>
                </li>
              )}
              {user.role === 'Trader' && (
                <li>
                  <Link href="/dashboard/search" className="text-blue-600 hover:underline">
                    {t.dashboard.findAnalyzers}
                  </Link>
                </li>
              )}
              <li>
                <Link href="/dashboard/feed" className="text-blue-600 hover:underline">
                  {t.dashboard.exploreFeed}
                </Link>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
