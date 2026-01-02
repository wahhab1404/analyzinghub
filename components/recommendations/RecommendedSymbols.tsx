'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, BarChart3 } from 'lucide-react'

interface SymbolRecommendation {
  symbol: {
    id: string
    symbol: string
    name: string
  }
  score: number
  reasons: Array<{
    type: string
    detail: string
  }>
  stats?: {
    total_analyses: number
    followers: number
  }
}

export function RecommendedSymbols() {
  const [recommendations, setRecommendations] = useState<SymbolRecommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecommendations()
  }, [])

  async function fetchRecommendations() {
    try {
      const response = await fetch('/api/recommendations/symbols?limit=5')
      if (response.ok) {
        const data = await response.json()
        setRecommendations(data.recommendations || [])
      }
    } catch (error) {
      console.error('Failed to fetch symbol recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recommended Symbols</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-20 mb-2" />
                <div className="h-3 bg-neutral-200 dark:bg-neutral-800 rounded w-32" />
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
        <CardTitle className="text-lg">Recommended Symbols</CardTitle>
        <CardDescription>Trending stocks and crypto</CardDescription>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <div className="text-center py-6">
            <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No recommendations yet. Start exploring!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
            <div
              key={rec.symbol.id}
              className="hover:bg-neutral-50 dark:hover:bg-neutral-900 p-2 rounded-lg transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">${rec.symbol.symbol}</span>
                  {rec.stats && rec.stats.total_analyses > 10 && (
                    <TrendingUp className="w-3 h-3 text-green-600" />
                  )}
                </div>
                {rec.stats && rec.stats.total_analyses > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <BarChart3 className="w-3 h-3 mr-1" />
                    {rec.stats.total_analyses}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                {rec.symbol.name}
              </p>
              {rec.reasons.length > 0 && (
                <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1 line-clamp-1">
                  {rec.reasons[0].detail}
                </p>
              )}
            </div>
          ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
