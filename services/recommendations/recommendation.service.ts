import { SupabaseClient } from '@supabase/supabase-js'
import {
  AnalysisRecommendation,
  AnalyzerRecommendation,
  SymbolRecommendation,
  UserPreferences,
  ScoringWeights,
  RecommendationReason
} from './types'

const DEFAULT_WEIGHTS: ScoringWeights = {
  recency: 0.25,
  symbol_affinity: 0.2,
  analyzer_affinity: 0.15,
  analyzer_quality: 0.15,
  engagement_momentum: 0.1,
  follower_relationship: 0.15,
  rating: 0.2
}

export class RecommendationService {
  constructor(
    private supabase: SupabaseClient,
    private adminClient?: SupabaseClient
  ) {}

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const client = this.adminClient || this.supabase

    try {
      const [followersData, symbolAffinityData, analyzerAffinityData, viewedData] = await Promise.all([
        this.supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .then(r => r.error ? { data: [] } : r),

        client
          .from('user_symbol_affinity')
          .select('symbol_id, interaction_count')
          .eq('user_id', userId)
          .then(r => r.error ? { data: [] } : r),

        client
          .from('user_analyzer_affinity')
          .select('analyzer_id, interaction_count')
          .eq('user_id', userId)
          .then(r => r.error ? { data: [] } : r),

        this.supabase
          .from('engagement_events')
          .select('entity_id')
          .eq('user_id', userId)
          .eq('entity_type', 'analysis')
          .eq('event_type', 'view')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .then(r => r.error ? { data: [] } : r)
      ])

    const followed_analyzers = followersData.data?.map(f => f.following_id) || []

    const symbol_affinity = new Map<string, number>()
    symbolAffinityData.data?.forEach(s => {
      symbol_affinity.set(s.symbol_id, s.interaction_count)
    })

    const analyzer_affinity = new Map<string, number>()
    analyzerAffinityData.data?.forEach(a => {
      analyzer_affinity.set(a.analyzer_id, a.interaction_count)
    })

    const viewed_analyses = new Set<string>(viewedData.data?.map(v => v.entity_id) || [])

      const symbolFollowsData = await this.supabase
        .from('engagement_events')
        .select('entity_id')
        .eq('user_id', userId)
        .eq('entity_type', 'symbol')
        .eq('event_type', 'follow')

      const followed_symbols = symbolFollowsData.data?.map(s => s.entity_id) || []

      return {
        followed_analyzers,
        followed_symbols,
        symbol_affinity,
        analyzer_affinity,
        viewed_analyses
      }
    } catch (error) {
      console.error('Error getting user preferences:', error)
      return {
        followed_analyzers: [],
        followed_symbols: [],
        symbol_affinity: new Map(),
        analyzer_affinity: new Map(),
        viewed_analyses: new Set()
      }
    }
  }

  async recommendAnalyses(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<AnalysisRecommendation[]> {
    const prefs = await this.getUserPreferences(userId)
    const candidates = await this.getAnalysisCandidates(userId, prefs)

    // Get subscription status
    const { data: subscriptions } = await this.supabase
      .from('subscriptions')
      .select('analyst_id')
      .eq('subscriber_id', userId)
      .eq('status', 'active')

    const subscribedToIds = new Set(subscriptions?.map(s => s.analyst_id) || [])
    const followedAnalyzerIds = new Set(prefs.followed_analyzers)

    // Filter based on visibility
    const filteredCandidates = candidates.filter(analysis => {
      const isOwnPost = analysis.analyzer_id === userId
      const isFollowing = followedAnalyzerIds.has(analysis.analyzer_id)
      const isSubscribed = subscribedToIds.has(analysis.analyzer_id)

      // Author always sees their own posts
      if (isOwnPost) return true

      // Check visibility
      if (!analysis.visibility || analysis.visibility === 'public') return true
      if (analysis.visibility === 'followers' && isFollowing) return true
      if (analysis.visibility === 'subscribers' && isSubscribed) return true
      if (analysis.visibility === 'private') return false

      return false
    })

    const scored = await this.scoreAnalyses(filteredCandidates, prefs, userId)

    const sorted = scored.sort((a, b) => b.score - a.score).slice(offset, offset + limit)

    if (sorted.length === 0) {
      return []
    }

    const analyzerIds = Array.from(new Set(sorted.map(r => r.analysis.analyzer_id)))

    const { data: followData } = await this.supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .in('following_id', analyzerIds)

    const followedSet = new Set(followData?.map(f => f.following_id) || [])

    return sorted.map(rec => ({
      ...rec,
      analysis: {
        ...rec.analysis,
        is_following: followedSet.has(rec.analysis.analyzer_id),
        is_own_post: rec.analysis.analyzer_id === userId,
        is_subscribed: subscribedToIds.has(rec.analysis.analyzer_id)
      }
    }))
  }

  private async getAnalysisCandidates(userId: string, prefs: UserPreferences) {
    const queries = []

    if (prefs.followed_analyzers.length > 0) {
      queries.push(
        this.supabase
          .from('analyses')
          .select(`
            *,
            profiles!analyses_analyzer_id_fkey (
              id,
              full_name,
              avatar_url
            ),
            symbols (
              id,
              symbol
            ),
            analysis_targets (
              id,
              price,
              expected_time
            )
          `)
          .in('analyzer_id', prefs.followed_analyzers)
          .eq('status', 'IN_PROGRESS')
          .order('created_at', { ascending: false })
          .limit(50)
      )
    }

    if (prefs.followed_symbols.length > 0) {
      queries.push(
        this.supabase
          .from('analyses')
          .select(`
            *,
            profiles!analyses_analyzer_id_fkey (
              id,
              full_name,
              avatar_url
            ),
            symbols (
              id,
              symbol
            ),
            analysis_targets (
              id,
              price,
              expected_time
            )
          `)
          .in('symbol_id', prefs.followed_symbols)
          .eq('status', 'IN_PROGRESS')
          .order('created_at', { ascending: false })
          .limit(50)
      )
    }

    const client = this.adminClient || this.supabase
    queries.push(
      client
        .from('trending_analyses')
        .select('analysis_id, engagement_count')
        .order('engagement_count', { ascending: false })
        .limit(30)
        .then(r => r.error ? { data: [] } : r)
    )

    const results = await Promise.all(queries)
    const analysisMap = new Map()

    results.forEach((result, index) => {
      if (result.data) {
        if (index === queries.length - 1) {
          result.data.forEach((item: any) => {
            if (!analysisMap.has(item.analysis_id)) {
              analysisMap.set(item.analysis_id, { id: item.analysis_id, trending: true })
            }
          })
        } else {
          result.data.forEach((item: any) => {
            if (!analysisMap.has(item.id) && item.analyzer_id !== userId) {
              analysisMap.set(item.id, item)
            }
          })
        }
      }
    })

    const trendingIds = Array.from(analysisMap.keys()).filter(
      id => analysisMap.get(id).trending
    )

    if (trendingIds.length > 0) {
      const trendingDetails = await this.supabase
        .from('analyses')
        .select(`
          *,
          profiles!analyses_analyzer_id_fkey (
            id,
            full_name,
            avatar_url
          ),
          symbols (
            id,
            symbol
          ),
          analysis_targets (
            id,
            price,
            expected_time
          )
        `)
        .in('id', trendingIds)
        .eq('status', 'IN_PROGRESS')

      trendingDetails.data?.forEach(item => {
        if (item.analyzer_id !== userId) {
          analysisMap.set(item.id, item)
        }
      })
    }

    return Array.from(analysisMap.values()).filter(a => !a.trending || analysisMap.get(a.id).analyzer_id)
  }

  private async scoreAnalyses(
    candidates: any[],
    prefs: UserPreferences,
    userId: string
  ): Promise<AnalysisRecommendation[]> {
    const analyzerIds = Array.from(new Set(candidates.map(c => c.analyzer_id)))

    const analyzerStats = await this.getAnalyzerStats(analyzerIds)

    return candidates.map(analysis => {
      const reasons: RecommendationReason[] = []
      let score = 0

      const recencyScore = this.calculateRecencyScore(analysis.created_at)
      score += recencyScore * DEFAULT_WEIGHTS.recency

      if (prefs.followed_symbols.includes(analysis.symbol_id)) {
        score += 1.0 * DEFAULT_WEIGHTS.symbol_affinity
        reasons.push({
          type: 'followed_symbol',
          detail: `You follow $${analysis.symbols?.symbol}`
        })
      } else if (prefs.symbol_affinity.has(analysis.symbol_id)) {
        const affinity = Math.min(prefs.symbol_affinity.get(analysis.symbol_id)! / 10, 1)
        score += affinity * DEFAULT_WEIGHTS.symbol_affinity
      }

      if (prefs.followed_analyzers.includes(analysis.analyzer_id)) {
        score += 1.0 * DEFAULT_WEIGHTS.follower_relationship
        reasons.push({
          type: 'followed_analyzer',
          detail: `From ${analysis.profiles?.full_name}`
        })
      } else if (prefs.analyzer_affinity.has(analysis.analyzer_id)) {
        const affinity = Math.min(prefs.analyzer_affinity.get(analysis.analyzer_id)! / 10, 1)
        score += affinity * DEFAULT_WEIGHTS.analyzer_affinity
      }

      const analyzerStat = analyzerStats.get(analysis.analyzer_id)
      if (analyzerStat) {
        const qualityScore = this.calculateQualityScore(
          analyzerStat.win_rate,
          analyzerStat.total_analyses
        )
        score += qualityScore * DEFAULT_WEIGHTS.analyzer_quality

        if (qualityScore > 0.7) {
          reasons.push({
            type: 'high_quality',
            detail: `${Math.round(analyzerStat.win_rate * 100)}% success rate`
          })
        }

        if (analyzerStat.average_rating > 0) {
          const ratingScore = this.calculateRatingScore(
            analyzerStat.average_rating,
            analyzerStat.total_ratings
          )
          score += ratingScore * DEFAULT_WEIGHTS.rating

          if (analyzerStat.average_rating >= 8 && analyzerStat.total_ratings >= 3) {
            reasons.push({
              type: 'high_rating',
              detail: `${analyzerStat.average_rating.toFixed(1)}/10 rated (${analyzerStat.total_ratings} reviews)`
            })
          }
        }
      }

      if (this.isRecent(analysis.created_at, 24)) {
        const trendingScore = this.calculateTrendingScore(analysis.id)
        score += trendingScore * DEFAULT_WEIGHTS.engagement_momentum

        if (trendingScore > 0.5) {
          reasons.push({
            type: 'trending',
            detail: 'Trending today'
          })
        }
      }

      if (this.isRecent(analysis.created_at, 2)) {
        reasons.push({
          type: 'new',
          detail: 'Just posted'
        })
      }

      if (prefs.viewed_analyses.has(analysis.id)) {
        score *= 0.3
      }

      return {
        analysis,
        score,
        reasons
      }
    })
  }

  async recommendAnalyzers(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<AnalyzerRecommendation[]> {
    const prefs = await this.getUserPreferences(userId)

    const coFollowQuery = prefs.followed_analyzers.length > 0
      ? this.supabase
          .from('follows')
          .select('following_id')
          .in('follower_id', prefs.followed_analyzers)
          .neq('following_id', userId)
      : null

    const analyzerRoleResult = await this.supabase
      .from('roles')
      .select('id')
      .eq('name', 'Analyzer')
      .maybeSingle()

    const analyzerRoleId = analyzerRoleResult.data?.id

    const topAnalyzersQuery = analyzerRoleId
      ? this.supabase
          .from('profiles')
          .select(`
            *,
            follower_count:follows!follows_following_id_fkey(count)
          `)
          .eq('role_id', analyzerRoleId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] })

    const [coFollowData, topAnalyzersData] = await Promise.all([
      coFollowQuery?.then(r => r.data) || Promise.resolve(null),
      topAnalyzersQuery.then(r => r.data)
    ])

    const candidateIds = new Set<string>()

    coFollowData?.forEach((f: any) => {
      if (!prefs.followed_analyzers.includes(f.following_id)) {
        candidateIds.add(f.following_id)
      }
    })

    topAnalyzersData?.forEach((a: any) => {
      if (!prefs.followed_analyzers.includes(a.id)) {
        candidateIds.add(a.id)
      }
    })

    const candidates = await this.supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(candidateIds))
      .eq('role_id', analyzerRoleId)

    if (!candidates.data) return []

    const stats = await this.getAnalyzerStats(Array.from(candidateIds))

    const scored = candidates.data.map(analyzer => {
      const reasons: RecommendationReason[] = []
      let score = 0

      const stat = stats.get(analyzer.id)
      if (stat) {
        const qualityScore = this.calculateQualityScore(stat.win_rate, stat.total_analyses)
        score += qualityScore * 0.4

        if (qualityScore > 0.7) {
          reasons.push({
            type: 'high_quality',
            detail: `${Math.round(stat.win_rate * 100)}% success rate`
          })
        }

        if (stat.average_rating > 0) {
          const ratingScore = this.calculateRatingScore(
            stat.average_rating,
            stat.total_ratings
          )
          score += ratingScore * 0.4

          if (stat.average_rating >= 8 && stat.total_ratings >= 3) {
            reasons.push({
              type: 'high_rating',
              detail: `${stat.average_rating.toFixed(1)}/10 stars`
            })
          }
        }
      }

      const coFollowCount = coFollowData?.filter(
        (f: any) => f.following_id === analyzer.id
      ).length || 0

      if (coFollowCount > 0) {
        score += Math.min(coFollowCount / 5, 1) * 0.15
        reasons.push({
          type: 'similar_interests',
          detail: `Followed by ${coFollowCount} analysts you follow`
        })
      }

      if (this.isRecent(analyzer.created_at, 7 * 24)) {
        reasons.push({
          type: 'new',
          detail: 'New analyzer'
        })
        score += 0.05
      }

      return {
        analyzer,
        score,
        reasons,
        stats: stat
      }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit)
  }

  async recommendSymbols(
    userId: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<SymbolRecommendation[]> {
    try {
      const prefs = await this.getUserPreferences(userId)

      let analysesFromFollowedQuery = null
      if (prefs.followed_analyzers.length > 0) {
        const query = this.supabase
          .from('analyses')
          .select('symbol_id')
          .in('analyzer_id', prefs.followed_analyzers)

        if (prefs.followed_symbols.length > 0) {
          analysesFromFollowedQuery = query.not('symbol_id', 'in', `(${prefs.followed_symbols.join(',')})`)
        } else {
          analysesFromFollowedQuery = query
        }
      }

      const trendingSymbolsQuery = this.supabase
        .from('symbols')
        .select(`
          *,
          analyses(count)
        `)
        .order('created_at', { ascending: false })
        .limit(50)

      let analysesData = null
      if (analysesFromFollowedQuery) {
        try {
          const result = await analysesFromFollowedQuery
          analysesData = result.data
        } catch (err) {
          console.error('Error fetching analyses from followed:', err)
          analysesData = null
        }
      }

      let trendingData = []
      try {
        const result = await trendingSymbolsQuery
        trendingData = result.data || []
      } catch (err) {
        console.error('Error fetching trending symbols:', err)
        trendingData = []
      }

      const candidateIds = new Set<string>()

      const symbolCounts = new Map<string, number>()
      analysesData?.forEach((a: any) => {
        if (!prefs.followed_symbols.includes(a.symbol_id)) {
          candidateIds.add(a.symbol_id)
          symbolCounts.set(a.symbol_id, (symbolCounts.get(a.symbol_id) || 0) + 1)
        }
      })

      trendingData?.forEach((s: any) => {
        if (!prefs.followed_symbols.includes(s.id)) {
          candidateIds.add(s.id)
        }
      })

      if (candidateIds.size === 0) {
        return []
      }

      const candidates = await this.supabase
        .from('symbols')
        .select(`
          *,
          analyses(count)
        `)
        .in('id', Array.from(candidateIds))

      if (!candidates.data || candidates.data.length === 0) return []

      const scored = candidates.data.map(symbol => {
        const reasons: RecommendationReason[] = []
        let score = 0

        const fromFollowedCount = symbolCounts.get(symbol.id) || 0
        if (fromFollowedCount > 0) {
          score += Math.min(fromFollowedCount / 5, 1) * 0.5
          reasons.push({
            type: 'followed_analyzer',
            detail: `${fromFollowedCount} analyses from people you follow`
          })
        }

        const analysisCount = (symbol.analyses as any)?.[0]?.count || 0
        if (analysisCount > 10) {
          score += Math.min(analysisCount / 50, 1) * 0.3
          reasons.push({
            type: 'trending',
            detail: `${analysisCount} recent analyses`
          })
        }

        return {
          symbol,
          score,
          reasons,
          stats: {
            total_analyses: analysisCount,
            followers: 0
          }
        }
      })

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(offset, offset + limit)
    } catch (error) {
      console.error('Error in recommendSymbols:', error)
      return []
    }
  }

  private async getAnalyzerStats(analyzerIds: string[]) {
    if (analyzerIds.length === 0) return new Map()

    const [performanceData, ratingsData] = await Promise.all([
      this.supabase
        .from('analyzer_performance')
        .select('*')
        .in('user_id', analyzerIds),

      this.supabase
        .from('analyzer_rating_stats')
        .select('*')
        .in('analyzer_id', analyzerIds)
    ])

    const statsMap = new Map()

    performanceData.data?.forEach(stat => {
      statsMap.set(stat.user_id, {
        win_rate: stat.win_rate || 0,
        total_analyses: stat.total_analyses || 0,
        followers: 0,
        average_rating: 0,
        total_ratings: 0
      })
    })

    ratingsData.data?.forEach(rating => {
      if (statsMap.has(rating.analyzer_id)) {
        const existing = statsMap.get(rating.analyzer_id)
        existing.average_rating = rating.average_rating || 0
        existing.total_ratings = rating.total_ratings || 0
      } else {
        statsMap.set(rating.analyzer_id, {
          win_rate: 0,
          total_analyses: 0,
          followers: 0,
          average_rating: rating.average_rating || 0,
          total_ratings: rating.total_ratings || 0
        })
      }
    })

    return statsMap
  }

  private calculateRecencyScore(createdAt: string): number {
    const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)

    if (hoursAgo < 2) return 1.0
    if (hoursAgo < 6) return 0.9
    if (hoursAgo < 24) return 0.7
    if (hoursAgo < 72) return 0.5
    if (hoursAgo < 168) return 0.3
    return 0.1
  }

  private calculateQualityScore(winRate: number, sampleSize: number): number {
    const minSamples = 5
    const confidence = Math.min(sampleSize / minSamples, 1)

    const adjustedWinRate = (winRate * sampleSize + 0.5 * (minSamples - sampleSize)) /
                            Math.max(sampleSize, minSamples)

    return adjustedWinRate * confidence
  }

  private calculateTrendingScore(analysisId: string): number {
    return 0.5
  }

  private isRecent(createdAt: string, hours: number): boolean {
    const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
    return hoursAgo < hours
  }

  private calculateRatingScore(averageRating: number, totalRatings: number): number {
    const maxRating = 10
    const minRatingsForConfidence = 5

    const confidence = Math.min(totalRatings / minRatingsForConfidence, 1)

    const normalizedRating = averageRating / maxRating

    const bayesianAverage =
      (totalRatings * averageRating + minRatingsForConfidence * (maxRating / 2)) /
      (totalRatings + minRatingsForConfidence) / maxRating

    return bayesianAverage * confidence + normalizedRating * (1 - confidence)
  }
}
