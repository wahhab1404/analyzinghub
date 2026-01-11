'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, Target, Award, Users, MessageSquare, Star, Repeat2, DollarSign, TrendingDown } from 'lucide-react'

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
              <span>Trading Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                <div className={`text-2xl font-bold ${tradingStats.win_rate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                  {tradingStats.win_rate}%
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Profit</div>
                <div className={`text-2xl font-bold ${tradingStats.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${tradingStats.total_profit >= 0 ? '' : '-'}${Math.abs(tradingStats.total_profit).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Closed Trades</div>
                <div className="text-2xl font-bold">{tradingStats.total_closed_trades.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">W/L Ratio</div>
                <div className="text-2xl font-bold">
                  {tradingStats.winning_trades}/{tradingStats.losing_trades}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Success Rate</span>
                <span className="font-medium">
                  {tradingStats.winning_trades} wins / {tradingStats.losing_trades} losses
                </span>
              </div>
              <SimpleProgress
                value={tradingStats.win_rate}
                className="h-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <TrendingUp className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-lg font-semibold text-green-600">
                    ${tradingStats.avg_win.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Win</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                <TrendingDown className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-lg font-semibold text-red-600">
                    ${Math.abs(tradingStats.avg_loss).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Loss</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                <Trophy className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-lg font-semibold text-green-600">
                    ${tradingStats.max_profit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Best Trade</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                <TrendingDown className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="text-lg font-semibold text-red-600">
                    ${Math.abs(tradingStats.max_loss).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">Worst Trade</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {data.analyst.points > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Analyst Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total Points</div>
                <div className="text-2xl font-bold">{data.analyst.points.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rank</div>
                <div className="text-2xl font-bold">
                  {data.analyst.rank ? `#${data.analyst.rank}` : 'Unranked'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
                <div className="text-2xl font-bold">{data.analyst.winRate.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Closed</div>
                <div className="text-2xl font-bold">{data.analyst.closedAnalyses}</div>
              </div>
            </div>

            {data.analyst.closedAnalyses > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">
                    {data.analyst.wins} wins / {data.analyst.losses} losses
                  </span>
                </div>
                <SimpleProgress value={data.analyst.winRate} className="h-2" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{data.analyst.targetHitsLast30Days}</div>
                  <div className="text-xs text-muted-foreground">Targets (30d)</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">
                    {data.analyst.weeklyPoints.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Weekly Points</div>
                </div>
              </div>
            </div>

            {data.analyst.badges.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Badges</div>
                <div className="flex flex-wrap gap-2">
                  {data.analyst.badges.map((badge: any) => (
                    <Badge
                      key={badge.badge_key}
                      variant="outline"
                      className={getBadgeColor(badge.badge_tier)}
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
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Engagement Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total Points</div>
                <div className="text-2xl font-bold">{data.trader.points.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rank</div>
                <div className="text-2xl font-bold">
                  {data.trader.rank ? `#${data.trader.rank}` : 'Unranked'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rating Accuracy</div>
                <div className="text-2xl font-bold">{data.trader.ratingAccuracy.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Ratings</div>
                <div className="text-2xl font-bold">{data.trader.ratings}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{data.trader.comments}</div>
                  <div className="text-xs text-muted-foreground">Comments</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{data.trader.likes}</div>
                  <div className="text-xs text-muted-foreground">Likes</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Repeat2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{data.trader.reposts}</div>
                  <div className="text-xs text-muted-foreground">Reposts</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">
                    {data.trader.weeklyPoints.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Weekly</div>
                </div>
              </div>
            </div>

            {data.trader.badges.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Badges</div>
                <div className="flex flex-wrap gap-2">
                  {data.trader.badges.map((badge: any) => (
                    <Badge
                      key={badge.badge_key}
                      variant="outline"
                      className={getBadgeColor(badge.badge_tier)}
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
