'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, Target, Award, Users, MessageSquare, Star, Repeat2, DollarSign, TrendingDown } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/language-context'

function SimpleProgress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`w-full bg-secondary rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

interface ProfileStatsProps {
  userId: string
}

interface RankingData {
  analyst: {
    points: number
    weeklyPoints: number
    monthlyPoints: number
    rank: number | null
    winRate: number
    wins: number
    losses: number
    closedAnalyses: number
    targetHitsLast30Days: number
    badges: any[]
  }
  trader: {
    points: number
    weeklyPoints: number
    monthlyPoints: number
    rank: number | null
    likes: number
    bookmarks: number
    reposts: number
    comments: number
    ratings: number
    ratingAccuracy: number
    badges: any[]
  }
}

interface TradingStats {
  total_closed_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number
  total_profit: number
  avg_win: number
  avg_loss: number
  max_profit: number
  max_loss: number
}

export function ProfileStats({ userId }: ProfileStatsProps) {
  const { t } = useLanguage()
  const [data, setData] = useState<RankingData | null>(null)
  const [tradingStats, setTradingStats] = useState<TradingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [userId])

  const loadData = async () => {
    try {
      const [rankingsRes, tradingRes] = await Promise.all([
        fetch(`/api/rankings/${userId}`),
        fetch(`/api/profiles/${userId}/trading-stats`)
      ])

      if (rankingsRes.ok) {
        const result = await rankingsRes.json()
        setData(result)
      }

      if (tradingRes.ok) {
        const tradingResult = await tradingRes.json()
        setTradingStats(tradingResult)
      }
    } catch (error) {
      console.error('Failed to load profile stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (!data) {
    return null
  }

  const getBadgeColor = (tier: string) => {
    switch (tier) {
      case 'diamond':
        return 'bg-cyan-100 text-cyan-700 border-cyan-300'
      case 'platinum':
        return 'bg-gray-100 text-gray-700 border-gray-300'
      case 'gold':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300'
      case 'silver':
        return 'bg-gray-100 text-gray-600 border-gray-300'
      case 'bronze':
        return 'bg-orange-100 text-orange-700 border-orange-300'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      {tradingStats && tradingStats.total_closed_trades > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span>{t.profileStats.tradingPerformance}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.winRate}</div>
                <div className={`text-lg font-bold ${tradingStats.win_rate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                  {tradingStats.win_rate}%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.totalProfit}</div>
                <div className={`text-lg font-bold break-words ${tradingStats.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {tradingStats.total_profit >= 0 ? '+' : ''}{tradingStats.total_profit.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.closedTrades}</div>
                <div className="text-lg font-bold">{tradingStats.total_closed_trades.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.wlRatio}</div>
                <div className="text-lg font-bold">
                  <span className="text-green-600">{tradingStats.winning_trades}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-red-600">{tradingStats.losing_trades}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                <TrendingUp className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-green-600 truncate">
                    {tradingStats.avg_win.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.avgWin}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-red-600 truncate">
                    {Math.abs(tradingStats.avg_loss).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.avgLoss}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                <Trophy className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-green-600 truncate">
                    {tradingStats.max_profit.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.bestTrade}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                <TrendingDown className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-red-600 truncate">
                    {Math.abs(tradingStats.max_loss).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.worstTrade}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.analyst.points > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <span>{t.profileStats.analystPerformance}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.totalPoints}</div>
                <div className="text-2xl font-bold">{data.analyst.points.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.rank}</div>
                {data.analyst.rank ? (
                  <div className="text-2xl font-bold text-primary">#{data.analyst.rank}</div>
                ) : (
                  <Badge variant="outline" className="text-sm font-medium mt-1">{t.profileStats.unranked}</Badge>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.winRate}</div>
                <div className={`text-2xl font-bold ${data.analyst.winRate >= 50 ? 'text-green-600' : data.analyst.winRate > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  {data.analyst.winRate.toFixed(1)}%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.closedAnalyses}</div>
                <div className="text-2xl font-bold">{data.analyst.closedAnalyses}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.analyst.targetHitsLast30Days}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.targetsHit30Days}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <Trophy className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.analyst.weeklyPoints.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.weeklyPoints}</div>
                </div>
              </div>
            </div>

            {data.analyst.badges.length > 0 && (
              <div className="pt-4 border-t">
                <div className="text-sm font-semibold mb-3">{t.profileStats.achievements}</div>
                <div className="flex flex-wrap gap-2">
                  {data.analyst.badges.map((badge: any) => (
                    <Badge
                      key={badge.badge_key}
                      variant="outline"
                      className={`${getBadgeColor(badge.badge_tier)} font-medium`}
                    >
                      {badge.badge_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data.trader.points > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span>{t.profileStats.engagementStats}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.totalPoints}</div>
                <div className="text-2xl font-bold">{data.trader.points.toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.rank}</div>
                {data.trader.rank ? (
                  <div className="text-2xl font-bold text-primary">#{data.trader.rank}</div>
                ) : (
                  <Badge variant="outline" className="text-sm font-medium mt-1">{t.profileStats.unranked}</Badge>
                )}
              </div>
              {data.trader.ratings > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.ratingAccuracy}</div>
                  <div className="text-2xl font-bold text-blue-600">{data.trader.ratingAccuracy.toFixed(1)}%</div>
                </div>
              )}
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{t.profileStats.totalRatings}</div>
                <div className="text-2xl font-bold">{data.trader.ratings}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <MessageSquare className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.trader.comments}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.comments}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <Star className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.trader.likes}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.likes}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <Repeat2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.trader.reposts}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.reposts}</div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-lg border bg-card">
                <Trophy className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold">{data.trader.weeklyPoints.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">{t.profileStats.weeklyPoints}</div>
                </div>
              </div>
            </div>

            {data.trader.badges.length > 0 && (
              <div className="pt-4 border-t">
                <div className="text-sm font-semibold mb-3">{t.profileStats.achievements}</div>
                <div className="flex flex-wrap gap-2">
                  {data.trader.badges.map((badge: any) => (
                    <Badge
                      key={badge.badge_key}
                      variant="outline"
                      className={`${getBadgeColor(badge.badge_tier)} font-medium`}
                    >
                      {badge.badge_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
