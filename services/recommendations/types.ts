export type EntityType = 'analysis' | 'analyzer' | 'symbol'
export type EventType = 'view' | 'like' | 'bookmark' | 'comment' | 'follow' | 'share' | 'unlike' | 'unbookmark' | 'unfollow'

export interface EngagementEvent {
  id: string
  user_id: string
  entity_type: EntityType
  entity_id: string
  event_type: EventType
  metadata?: Record<string, any>
  created_at: string
}

export interface RecommendationReason {
  type: 'followed_analyzer' | 'followed_symbol' | 'trending' | 'high_quality' | 'similar_interests' | 'new' | 'high_rating'
  detail: string
}

export interface AnalysisRecommendation {
  analysis: any
  score: number
  reasons: RecommendationReason[]
}

export interface AnalyzerRecommendation {
  analyzer: any
  score: number
  reasons: RecommendationReason[]
  stats?: {
    total_analyses: number
    win_rate: number
    followers: number
  }
}

export interface SymbolRecommendation {
  symbol: any
  score: number
  reasons: RecommendationReason[]
  stats?: {
    total_analyses: number
    followers: number
  }
}

export interface UserPreferences {
  followed_analyzers: string[]
  followed_symbols: string[]
  symbol_affinity: Map<string, number>
  analyzer_affinity: Map<string, number>
  viewed_analyses: Set<string>
}

export interface ScoringWeights {
  recency: number
  symbol_affinity: number
  analyzer_affinity: number
  analyzer_quality: number
  engagement_momentum: number
  follower_relationship: number
  rating: number
}
