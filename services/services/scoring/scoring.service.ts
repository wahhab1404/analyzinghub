import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface ScoringEvent {
  userId: string
  role: 'analyst' | 'trader'
  eventType:
    | 'analysis_created'
    | 'target_hit'
    | 'stop_hit'
    | 'like'
    | 'bookmark'
    | 'repost'
    | 'comment'
    | 'rating'
    | 'helpful_vote'
    | 'unhelpful_vote'
  entityType: 'analysis' | 'comment' | 'symbol' | 'user' | 'target'
  entityId: string
  pointsDelta: number
  metadata?: Record<string, any>
}

interface DailyCap {
  traderPointsToday: number
  analystAnalysesToday: number
}

export class ScoringService {
  private getClient(): SupabaseClient {
    return createServiceRoleClient()
  }

  private get supabase(): SupabaseClient {
    return this.getClient()
  }

  async awardPoints(event: ScoringEvent): Promise<{ ok: boolean; error?: string }> {
    try {
      const accountCheck = await this.checkAccountEligibility(event.userId, event.role)
      if (!accountCheck.ok) {
        return { ok: false, error: accountCheck.error }
      }

      const capCheck = await this.checkDailyCaps(event)
      if (!capCheck.ok) {
        return { ok: false, error: capCheck.error }
      }

      const qualityCheck = await this.checkQualityRules(event)
      if (!qualityCheck.ok) {
        return { ok: false, error: qualityCheck.error }
      }

      const { data: ledgerEntry, error: ledgerError } = await (this.supabase
        .from('user_points_ledger') as any)
        .insert({
          user_id: event.userId,
          role: event.role,
          event_type: event.eventType,
          entity_type: event.entityType,
          entity_id: event.entityId,
          points_delta: event.pointsDelta,
          metadata: event.metadata || {},
        })
        .select()
        .single()

      if (ledgerError) {
        if (ledgerError.code === '23505') {
          return { ok: false, error: 'Points already awarded for this event' }
        }
        console.error('Ledger error:', ledgerError)
        return { ok: false, error: 'Failed to record points' }
      }

      await this.updateBalance(event.userId, event.role, event.pointsDelta)
      await this.updateDailyCap(event)

      return { ok: true }
    } catch (error) {
      console.error('Scoring error:', error)
      return { ok: false, error: 'Internal scoring error' }
    }
  }

  async awardAnalysisCreationPoints(
    analystId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    return this.awardPoints({
      userId: analystId,
      role: 'analyst',
      eventType: 'analysis_created',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: 5,
    })
  }

  async awardTargetHitPoints(
    analystId: string,
    analysisId: string,
    targetIndex: number
  ): Promise<{ ok: boolean; error?: string }> {
    return this.awardPoints({
      userId: analystId,
      role: 'analyst',
      eventType: 'target_hit',
      entityType: 'target',
      entityId: analysisId,
      pointsDelta: 10,
      metadata: { targetIndex },
    })
  }

  async deductStopLossPoints(
    analystId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    return this.awardPoints({
      userId: analystId,
      role: 'analyst',
      eventType: 'stop_hit',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: -10,
    })
  }

  async awardLikePoints(
    traderId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: existing } = await this.supabase
      .from('likes')
      .select('id')
      .eq('user_id', traderId)
      .eq('analysis_id', analysisId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, error: 'Like not found in database' }
    }

    return this.awardPoints({
      userId: traderId,
      role: 'trader',
      eventType: 'like',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: 1,
    })
  }

  async awardBookmarkPoints(
    traderId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: existing } = await this.supabase
      .from('saves')
      .select('id')
      .eq('user_id', traderId)
      .eq('analysis_id', analysisId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, error: 'Bookmark not found in database' }
    }

    return this.awardPoints({
      userId: traderId,
      role: 'trader',
      eventType: 'bookmark',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: 2,
    })
  }

  async awardRepostPoints(
    traderId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: existing } = await this.supabase
      .from('reposts')
      .select('id')
      .eq('user_id', traderId)
      .eq('analysis_id', analysisId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, error: 'Repost not found in database' }
    }

    return this.awardPoints({
      userId: traderId,
      role: 'trader',
      eventType: 'repost',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: 3,
    })
  }

  async awardCommentPoints(
    traderId: string,
    commentId: string,
    content: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (content.length < 25) {
      return { ok: false, error: 'Comment too short (minimum 25 characters)' }
    }

    if (this.isLowQualityComment(content)) {
      return { ok: false, error: 'Comment does not meet quality standards' }
    }

    const { data: recentComments } = await this.supabase
      .from('comments')
      .select('content')
      .eq('user_id', traderId)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .limit(10)

    if (recentComments && recentComments.some((c: any) => c.content === content)) {
      return { ok: false, error: 'Duplicate comment detected' }
    }

    return this.awardPoints({
      userId: traderId,
      role: 'trader',
      eventType: 'comment',
      entityType: 'comment',
      entityId: commentId,
      pointsDelta: 3,
    })
  }

  async awardRatingPoints(
    traderId: string,
    analysisId: string
  ): Promise<{ ok: boolean; error?: string }> {
    const { data: analysis } = await this.supabase
      .from('analyses')
      .select('status, analyzer_id')
      .eq('id', analysisId)
      .single()

    if (!analysis) {
      return { ok: false, error: 'Analysis not found' }
    }

    const analysisData = analysis as any

    if (analysisData.analyzer_id === traderId) {
      return { ok: false, error: 'Cannot rate your own analysis' }
    }

    if (!['SUCCESS', 'FAILED'].includes(analysisData.status)) {
      return { ok: false, error: 'Can only rate closed analyses' }
    }

    return this.awardPoints({
      userId: traderId,
      role: 'trader',
      eventType: 'rating',
      entityType: 'analysis',
      entityId: analysisId,
      pointsDelta: 5,
    })
  }

  private async checkAccountEligibility(
    userId: string,
    role: 'analyst' | 'trader'
  ): Promise<{ ok: boolean; error?: string }> {
    if (role !== 'trader') {
      return { ok: true }
    }

    const { data: stats } = await this.supabase
      .from('user_stats')
      .select('account_created_at, is_email_verified')
      .eq('user_id', userId)
      .maybeSingle()

    if (!stats) {
      return { ok: false, error: 'User stats not found' }
    }

    const statsData = stats as any

    if (!statsData.is_email_verified) {
      return { ok: false, error: 'Email verification required to earn points' }
    }

    const accountAge = Date.now() - new Date(statsData.account_created_at).getTime()
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    if (accountAge < sevenDays) {
      return { ok: false, error: 'Account must be at least 7 days old' }
    }

    return { ok: true }
  }

  private async checkDailyCaps(event: ScoringEvent): Promise<{ ok: boolean; error?: string }> {
    const today = new Date().toISOString().split('T')[0]

    const { data: cap } = await this.supabase
      .from('daily_points_cap')
      .select('*')
      .eq('user_id', event.userId)
      .eq('date', today)
      .maybeSingle()

    const capData = cap as any

    if (event.role === 'trader') {
      const currentPoints = capData?.trader_points_today || 0
      if (currentPoints >= 100) {
        return { ok: false, error: 'Daily point cap reached (100 points)' }
      }
    }

    if (event.role === 'analyst' && event.eventType === 'analysis_created') {
      const currentAnalyses = capData?.analyst_analyses_today || 0
      if (currentAnalyses >= 10) {
        return { ok: false, error: 'Daily analysis limit reached (10 analyses)' }
      }
    }

    return { ok: true }
  }

  private async checkQualityRules(event: ScoringEvent): Promise<{ ok: boolean; error?: string }> {
    if (event.eventType === 'like' || event.eventType === 'repost') {
      const recentActivity = await this.supabase
        .from('user_points_ledger')
        .select('id')
        .eq('user_id', event.userId)
        .eq('event_type', event.eventType)
        .gte('created_at', new Date(Date.now() - 60000).toISOString())

      if (recentActivity.data && recentActivity.data.length > 20) {
        await this.flagSuspiciousActivity(event.userId, `High ${event.eventType} volume`, {
          eventType: event.eventType,
          count: recentActivity.data.length,
          timeWindow: '1 minute',
        })
        return { ok: false, error: 'Rate limit exceeded' }
      }
    }

    return { ok: true }
  }

  private isLowQualityComment(content: string): boolean {
    const emojiRegex = /[\p{Emoji}]/gu
    const emojis = content.match(emojiRegex) || []
    const emojiRatio = emojis.length / content.length

    if (emojiRatio > 0.5) {
      return true
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = content.match(urlRegex) || []
    if (urls.length > 3) {
      return true
    }

    const words = content.split(/\s+/)
    if (words.length < 5) {
      return true
    }

    return false
  }

  private async updateBalance(userId: string, role: 'analyst' | 'trader', pointsDelta: number) {
    const field = role === 'analyst' ? 'analyst_points_all_time' : 'trader_points_all_time'

    await (this.supabase
      .from('user_points_balance') as any)
      .upsert(
        {
          user_id: userId,
          [field]: 0,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    await (this.supabase as any).rpc('increment_points', {
      p_user_id: userId,
      p_field: field,
      p_delta: pointsDelta,
    })
  }

  private async updateDailyCap(event: ScoringEvent) {
    const today = new Date().toISOString().split('T')[0]

    if (event.role === 'trader') {
      await (this.supabase
        .from('daily_points_cap') as any)
        .upsert(
          {
            user_id: event.userId,
            date: today,
            trader_points_today: 0,
            analyst_analyses_today: 0,
          },
          { onConflict: 'user_id,date' }
        )

      await (this.supabase as any).rpc('increment_daily_cap', {
        p_user_id: event.userId,
        p_date: today,
        p_field: 'trader_points_today',
        p_delta: Math.max(0, event.pointsDelta),
      })
    }

    if (event.role === 'analyst' && event.eventType === 'analysis_created') {
      await (this.supabase
        .from('daily_points_cap') as any)
        .upsert(
          {
            user_id: event.userId,
            date: today,
            trader_points_today: 0,
            analyst_analyses_today: 0,
          },
          { onConflict: 'user_id,date' }
        )

      await (this.supabase as any).rpc('increment_daily_cap', {
        p_user_id: event.userId,
        p_date: today,
        p_field: 'analyst_analyses_today',
        p_delta: 1,
      })
    }
  }

  private async flagSuspiciousActivity(userId: string, activityType: string, details: any) {
    await (this.supabase.from('suspicious_activity_log') as any).insert({
      user_id: userId,
      activity_type: activityType,
      details,
    })
  }
}

export const scoringService = new ScoringService()
