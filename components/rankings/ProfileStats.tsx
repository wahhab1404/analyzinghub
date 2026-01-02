'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Trophy, TrendingUp, Target, Award, Users, MessageSquare, Star, Repeat2 } from 'lucide-react'

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

export function ProfileStats({ userId }: ProfileStatsProps) {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRankings()
  }, [userId])

  const loadRankings = async () => {
    try {
      const response = await fetch(`/api/rankings/${userId}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Failed to load rankings:', error)
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
                <Progress value={data.analyst.winRate} className="h-2" />
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
