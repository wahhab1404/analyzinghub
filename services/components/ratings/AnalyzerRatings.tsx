'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StarRating } from './StarRating'
import { formatDistanceToNow } from 'date-fns'

interface Rating {
  id: string
  rating: number
  review_text: string | null
  created_at: string
  profiles: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface RatingStats {
  average_rating: number
  total_ratings: number
  rating_distribution: Record<string, number>
}

interface AnalyzerRatingsProps {
  analyzerId: string
}

export function AnalyzerRatings({ analyzerId }: AnalyzerRatingsProps) {
  const [ratings, setRatings] = useState<Rating[]>([])
  const [stats, setStats] = useState<RatingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRatings()
  }, [analyzerId])

  async function fetchRatings() {
    try {
      const response = await fetch(`/api/ratings/${analyzerId}?limit=10`)
      if (response.ok) {
        const data = await response.json()
        setRatings(data.ratings || [])
        setStats(data.stats || null)
      }
    } catch (error) {
      console.error('Failed to fetch ratings:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ratings & Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-32 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stats || stats.total_ratings === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ratings & Reviews</CardTitle>
          <CardDescription>No ratings yet</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const distributionArray = Array.from({ length: 10 }, (_, i) => {
    const rating = 10 - i
    const count = stats.rating_distribution?.[rating.toString()] || 0
    return { rating, count }
  })

  const maxCount = Math.max(...distributionArray.map(d => d.count), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ratings & Reviews</CardTitle>
        <CardDescription>{stats.total_ratings} total ratings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-6">
          <div className="flex flex-col items-center">
            <div className="text-4xl font-bold">{stats.average_rating.toFixed(1)}</div>
            <StarRating rating={stats.average_rating} size="md" showValue={false} />
            <div className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              out of 10
            </div>
          </div>

          <div className="flex-1 space-y-1">
            {distributionArray.map(({ rating, count }) => (
              <div key={rating} className="flex items-center gap-2">
                <span className="text-sm w-6 text-right">{rating}</span>
                <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 transition-all"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-neutral-600 dark:text-neutral-400 w-8">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {ratings.length > 0 && (
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Recent Reviews</h3>
            {ratings.map((rating) => (
              <div key={rating.id} className="space-y-2">
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={rating.profiles.avatar_url || undefined} />
                    <AvatarFallback>
                      {rating.profiles.full_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {rating.profiles.full_name}
                      </span>
                      <StarRating
                        rating={rating.rating}
                        size="sm"
                        showValue={false}
                      />
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {formatDistanceToNow(new Date(rating.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                    {rating.review_text && (
                      <p className="text-sm mt-2 text-neutral-700 dark:text-neutral-300">
                        {rating.review_text}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
