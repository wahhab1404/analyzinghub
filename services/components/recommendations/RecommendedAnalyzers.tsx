'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StarRating } from '@/components/ratings/StarRating'
import { SubscriptionStatusBadge } from '@/components/subscriptions/SubscriptionStatusBadge'
import { TrendingUp, Users } from 'lucide-react'

interface AnalyzerRecommendation {
  analyzer: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
  score: number
  reasons: Array<{
    type: string
    detail: string
  }>
  stats?: {
    total_analyses: number
    win_rate: number
    followers: number
    average_rating?: number
    total_ratings?: number
  }
  is_following?: boolean
}

export function RecommendedAnalyzers() {
  const [recommendations, setRecommendations] = useState<AnalyzerRecommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecommendations()
  }, [])

  async function fetchRecommendations() {
    try {
      const response = await fetch('/api/recommendations/analyzers?limit=5')
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Failed to fetch analyzer recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recommended Analyzers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-24 mb-2" />
                  <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recommended Analyzers</CardTitle>
        <CardDescription>Discover top analysts to follow</CardDescription>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <div className="text-center py-6">
            <Users className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No recommendations yet. Start exploring!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec) => (
            <Link
              key={rec.analyzer.id}
              href={`/dashboard/profile/${rec.analyzer.id}`}
              className="flex items-start gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 p-2 rounded-lg transition-colors"
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={rec.analyzer.avatar_url || undefined} />
                <AvatarFallback>
                  {rec.analyzer.display_name?.[0]?.toUpperCase() || rec.analyzer.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm truncate">
                    {rec.analyzer.display_name || rec.analyzer.username}
                  </p>
                  {rec.stats && rec.stats.win_rate > 0.7 && (
                    <TrendingUp className="w-3 h-3 text-green-600" />
                  )}
                  <SubscriptionStatusBadge
                    analyzerId={rec.analyzer.id}
                    analyzerName={rec.analyzer.display_name || rec.analyzer.username}
                    isFollowing={rec.is_following || false}
                    showButton={false}
                  />
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  @{rec.analyzer.username}
                </p>
                {rec.stats && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {rec.stats.win_rate > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(rec.stats.win_rate * 100)}% success
                      </Badge>
                    )}
                    {rec.stats.average_rating && rec.stats.average_rating > 0 && (
                      <div className="flex items-center">
                        <StarRating
                          rating={rec.stats.average_rating}
                          size="sm"
                          showValue={false}
                        />
                        <span className="text-xs text-neutral-600 dark:text-neutral-400 ml-1">
                          ({rec.stats.total_ratings})
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {rec.reasons.length > 0 && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 line-clamp-1">
                    {rec.reasons[0].detail}
                  </p>
                )}
              </div>
            </Link>
          ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
