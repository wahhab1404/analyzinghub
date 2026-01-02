'use client'

import { useEffect, useState } from 'react'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { Badge } from '@/components/ui/badge'
import { Sparkles, TrendingUp, Star, Users, Award } from 'lucide-react'

interface Analysis {
  id: string
  user_id: string
  symbol_id: string
  direction: 'Long' | 'Short' | 'Neutral'
  entry_price: number
  stop_loss: number
  timeframe: string
  confidence: string
  rationale: string
  chart_image_url: string | null
  created_at: string
  status?: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED'
  validated_at?: string | null
  is_following?: boolean
  is_own_post?: boolean
  profiles: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    full_name: string
  }
  symbols: {
    id: string
    symbol: string
    name: string
  }
  analysis_targets: Array<{
    id: string
    target_type: string
    price: number
    expected_time: string
    hit_at?: string | null
  }>
  validation_events?: Array<{
    event_type: 'STOP_LOSS_HIT' | 'TARGET_HIT'
    target_number: number | null
    price_at_hit: number
    hit_at: string
  }>
}

interface RecommendationReason {
  type: string
  detail: string
}

interface AnalysisRecommendation {
  analysis: Analysis
  score: number
  reasons: RecommendationReason[]
}

const reasonIcons: Record<string, any> = {
  followed_analyzer: Users,
  followed_symbol: TrendingUp,
  trending: Sparkles,
  high_quality: Star,
  high_rating: Award,
  similar_interests: Users,
  new: Sparkles
}

export function RecommendedFeed() {
  const [recommendations, setRecommendations] = useState<AnalysisRecommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecommendations()
  }, [])

  async function fetchRecommendations() {
    try {
      const response = await fetch('/api/recommendations/feed?limit=10')
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Failed to fetch feed recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Recommended for You</h2>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-neutral-900 rounded-lg p-6 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-32 mb-2" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-24" />
              </div>
            </div>
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4 mb-2" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold">Recommended for You</h2>
      </div>
      {recommendations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No Recommendations Yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Start following analysts and interacting with analyses to get personalized recommendations
          </p>
        </div>
      ) : (
        recommendations.map((rec) => (
        <div key={rec.analysis.id} className="space-y-2">
          {rec.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2">
              {rec.reasons.map((reason, idx) => {
                const Icon = reasonIcons[reason.type] || Sparkles
                return (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-xs flex items-center gap-1"
                  >
                    <Icon className="w-3 h-3" />
                    {reason.detail}
                  </Badge>
                )
              })}
            </div>
          )}
          <AnalysisCard analysis={rec.analysis} onFollowChange={fetchRecommendations} />
        </div>
      )))}
    </div>
  )
}
