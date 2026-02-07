'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

interface LeaderboardEntry {
  rank: number
  userId: string
  fullName: string
  avatarUrl: string | null
  points: number
  winRate?: number
  closedAnalyses?: number
  ratingAccuracy?: number
  badges: Array<{
    key: string
    name: string
    tier: string
  }>
}

interface LeaderboardViewProps {
  initialType?: 'analyst' | 'trader'
  initialScope?: 'weekly' | 'monthly' | 'all_time'
}

export function LeaderboardView({ initialType = 'analyst', initialScope = 'all_time' }: LeaderboardViewProps = {}) {
  const { t } = useTranslation()
  const [type, setType] = useState<'analyst' | 'trader'>(initialType)
  const [scope, setScope] = useState<'weekly' | 'monthly' | 'all_time'>(initialScope)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLeaderboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, scope])

  const loadLeaderboard = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/leaderboards?type=${type}&scope=${scope}`)
      if (response.ok) {
        const data = await response.json()
        setLeaderboard(data.rows || [])
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-6 w-6 text-yellow-500" />
    if (rank === 2) return <Medal className="h-6 w-6 text-gray-400" />
    if (rank === 3) return <Award className="h-6 w-6 text-amber-600" />
    return <span className="text-2xl font-bold text-muted-foreground">{rank}</span>
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

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              {t.leaderboard.leaderboards}
            </CardTitle>
            <CardDescription>{t.leaderboard.topPerformers}</CardDescription>
          </div>
        </div>

        <Tabs value={type} onValueChange={(v) => setType(v as 'analyst' | 'trader')} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="analyst">{t.leaderboard.analysts}</TabsTrigger>
            <TabsTrigger value="trader">{t.leaderboard.traders}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={scope} onValueChange={(v) => setScope(v as 'weekly' | 'monthly' | 'all_time')} className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="weekly">{t.leaderboard.thisWeek}</TabsTrigger>
            <TabsTrigger value="monthly">{t.leaderboard.thisMonth}</TabsTrigger>
            <TabsTrigger value="all_time">{t.leaderboard.allTime}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t.leaderboard.noRankingsYet}
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <Link
                key={entry.userId}
                href={`/dashboard/profile/${entry.userId}`}
                className="block"
              >
                <div
                  className={`flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors ${
                    entry.rank <= 3 ? 'bg-muted/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-center w-12">
                    {getRankIcon(entry.rank)}
                  </div>

                  <Avatar className="h-12 w-12">
                    <AvatarImage src={entry.avatarUrl || undefined} />
                    <AvatarFallback>
                      {entry.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{entry.fullName}</div>
                    <div className="text-sm text-muted-foreground">
                      {t.leaderboard.points.replace('{points}', entry.points.toLocaleString())}
                      {type === 'analyst' && entry.winRate !== undefined && (
                        <span className="ml-2">
                          • {t.leaderboard.winRate.replace('{rate}', entry.winRate.toFixed(1))}
                        </span>
                      )}
                      {type === 'analyst' && entry.closedAnalyses !== undefined && (
                        <span className="ml-2">
                          • {t.leaderboard.closedAnalyses.replace('{count}', entry.closedAnalyses.toString())}
                        </span>
                      )}
                      {type === 'trader' && entry.ratingAccuracy !== undefined && (
                        <span className="ml-2">
                          • {t.leaderboard.accuracy.replace('{rate}', entry.ratingAccuracy.toFixed(1))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap justify-end">
                    {entry.badges.slice(0, 3).map((badge) => (
                      <Badge
                        key={badge.key}
                        variant="outline"
                        className={getBadgeColor(badge.tier)}
                      >
                        {badge.name}
                      </Badge>
                    ))}
                    {entry.badges.length > 3 && (
                      <Badge variant="outline">{t.leaderboard.plusCount.replace('{count}', (entry.badges.length - 3).toString())}</Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
