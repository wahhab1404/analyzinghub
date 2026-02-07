import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface BadgeDefinition {
  key: string
  name: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  criteria: (stats: UserStats) => boolean
}

interface UserStats {
  closed_analyses: number
  successful_analyses: number
  failed_analyses: number
  win_rate: number
  consecutive_stops: number
  target_hits_last_30_days: number
  total_ratings_given: number
  accurate_ratings: number
  rating_accuracy: number
  total_reposts: number
  successful_reposts: number
  unique_analysts_followed: number
  unique_symbols_interacted: number
  last_active_at: string
}

export class BadgeService {
  private getClient(): SupabaseClient {
    return createServiceRoleClient()
  }

  private get supabase(): SupabaseClient {
    return this.getClient()
  }

  private analystBadges: BadgeDefinition[] = [
    {
      key: 'consistent_analyst',
      name: 'Consistent Analyst',
      tier: 'bronze',
      criteria: (stats) =>
        stats.win_rate >= 60 &&
        stats.win_rate < 70 &&
        stats.closed_analyses >= 20,
    },
    {
      key: 'professional_analyst',
      name: 'Professional Analyst',
      tier: 'silver',
      criteria: (stats) =>
        stats.win_rate >= 70 &&
        stats.win_rate < 80 &&
        stats.closed_analyses >= 40 &&
        stats.target_hits_last_30_days >= 3,
    },
    {
      key: 'elite_analyst',
      name: 'Elite Analyst',
      tier: 'gold',
      criteria: (stats) =>
        stats.win_rate >= 80 &&
        stats.win_rate < 90 &&
        stats.closed_analyses >= 60 &&
        stats.consecutive_stops <= 2,
    },
    {
      key: 'legend_analyst',
      name: 'Legend',
      tier: 'diamond',
      criteria: (stats) => {
        const daysSinceActive =
          (Date.now() - new Date(stats.last_active_at).getTime()) / (1000 * 60 * 60 * 24)
        return (
          stats.win_rate >= 90 &&
          stats.closed_analyses >= 100 &&
          daysSinceActive <= 60
        )
      },
    },
  ]

  private traderBadges: BadgeDefinition[] = [
    {
      key: 'insightful_rater',
      name: 'Insightful Rater',
      tier: 'silver',
      criteria: (stats) =>
        stats.total_ratings_given >= 50 &&
        stats.rating_accuracy >= 60,
    },
    {
      key: 'market_supporter',
      name: 'Market Supporter',
      tier: 'bronze',
      criteria: (stats) =>
        stats.total_reposts >= 20 &&
        stats.successful_reposts >= 10,
    },
    {
      key: 'hybrid_trader',
      name: 'Hybrid Trader',
      tier: 'gold',
      criteria: (stats) =>
        stats.rating_accuracy >= 70 &&
        stats.unique_analysts_followed >= 10 &&
        stats.unique_symbols_interacted >= 10,
    },
  ]

  async evaluateAndAwardBadges(userId: string): Promise<{ awarded: string[]; revoked: string[] }> {
    try {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('role_id, roles!inner(name)')
        .eq('id', userId)
        .single()

      if (!profile) {
        return { awarded: [], revoked: [] }
      }

      const profileData = profile as any
      const roleName = profileData.roles?.name

      const { data: stats } = await this.supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (!stats) {
        return { awarded: [], revoked: [] }
      }

      const badges = roleName === 'Analyzer' ? this.analystBadges : this.traderBadges
      const awarded: string[] = []
      const revoked: string[] = []

      const { data: currentBadges } = await this.supabase
        .from('user_badges')
        .select('badge_key')
        .eq('user_id', userId)
        .is('revoked_at', null)

      const currentBadgeKeys = new Set<string>(
        currentBadges?.map((b: any) => b.badge_key as string) || []
      )

      for (const badge of badges) {
        const meetsRequirements = badge.criteria(stats as UserStats)
        const hasBadge = currentBadgeKeys.has(badge.key)

        if (meetsRequirements && !hasBadge) {
          await this.awardBadge(userId, badge, stats)
          awarded.push(badge.key)
        } else if (!meetsRequirements && hasBadge) {
          await this.revokeBadge(userId, badge.key)
          revoked.push(badge.key)
        }
      }

      return { awarded, revoked }
    } catch (error) {
      console.error('Badge evaluation error:', error)
      return { awarded: [], revoked: [] }
    }
  }

  async awardBadge(userId: string, badge: BadgeDefinition, stats: any) {
    const metadata = {
      winRate: stats.win_rate,
      closedAnalyses: stats.closed_analyses,
      totalRatings: stats.total_ratings_given,
      ratingAccuracy: stats.rating_accuracy,
      awardedDate: new Date().toISOString(),
    }

    await (this.supabase.from('user_badges') as any).insert({
      user_id: userId,
      badge_key: badge.key,
      badge_name: badge.name,
      badge_tier: badge.tier,
      metadata,
    })

    await (this.supabase.from('notifications') as any).insert({
      user_id: userId,
      type: 'badge_awarded',
      title: 'New Badge Earned! 🏆',
      message: `Congratulations! You've earned the "${badge.name}" badge.`,
      is_read: false,
    })
  }

  async revokeBadge(userId: string, badgeKey: string) {
    await (this.supabase.from('user_badges') as any)
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('badge_key', badgeKey)
      .is('revoked_at', null)
  }

  async getAllBadgeDefinitions() {
    return {
      analyst: this.analystBadges.map((b) => ({
        key: b.key,
        name: b.name,
        tier: b.tier,
      })),
      trader: this.traderBadges.map((b) => ({
        key: b.key,
        name: b.name,
        tier: b.tier,
      })),
    }
  }

  async getUserBadges(userId: string) {
    const { data: badges } = await this.supabase
      .from('user_badges')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('awarded_at', { ascending: false })

    return badges || []
  }
}

export const badgeService = new BadgeService()
