import { createServerClient } from '@/lib/supabase/server';

export interface UserEntitlements {
  packageKey: string;
  followAnalyzersLimit: number | null;
  telegramChannelsLimit: number;
  publishLimitPerDay: number | null;
  canFollowSymbols: boolean;
  canExport: boolean;
  canTelegramAlerts: boolean;
  canLiveIndexRead: boolean;
  canPublishAnalyses: boolean;
  canLiveAnalysisMode: boolean;
  canExtendedTargets: boolean;
  canEdit5Min: boolean;
  hasEliteBadge: boolean;
  hasPrivateSupport: boolean;
}

export interface EntitlementCheck {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  upgradePackage?: string;
}

export class EntitlementsService {
  /**
   * Get user's current entitlements from cache
   */
  static async getUserEntitlements(userId: string): Promise<UserEntitlements | null> {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from('user_limits_cache')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return {
        packageKey: 'free_trader',
        followAnalyzersLimit: 50,
        telegramChannelsLimit: 0,
        publishLimitPerDay: null,
        canFollowSymbols: false,
        canExport: false,
        canTelegramAlerts: false,
        canLiveIndexRead: false,
        canPublishAnalyses: false,
        canLiveAnalysisMode: false,
        canExtendedTargets: false,
        canEdit5Min: false,
        hasEliteBadge: false,
        hasPrivateSupport: false,
      };
    }

    return {
      packageKey: data.package_key,
      followAnalyzersLimit: data.follow_analyzers_limit,
      telegramChannelsLimit: data.telegram_channels_limit,
      publishLimitPerDay: data.publish_limit_per_day,
      canFollowSymbols: data.can_follow_symbols,
      canExport: data.can_export,
      canTelegramAlerts: data.can_telegram_alerts,
      canLiveIndexRead: data.can_live_index_read,
      canPublishAnalyses: data.can_publish_analyses,
      canLiveAnalysisMode: data.can_live_analysis_mode,
      canExtendedTargets: data.can_extended_targets,
      canEdit5Min: data.can_edit_5min,
      hasEliteBadge: data.has_elite_badge,
      hasPrivateSupport: data.has_private_support,
    };
  }

  /**
   * Check if user can follow more analyzers
   */
  static async checkCanFollowAnalyzer(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements) {
      return {
        allowed: false,
        reason: 'Unable to fetch entitlements',
      };
    }

    // Unlimited follows
    if (entitlements.followAnalyzersLimit === null) {
      return { allowed: true };
    }

    // Check current follow count
    const supabase = createServerClient();
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    const currentCount = count || 0;

    if (currentCount >= entitlements.followAnalyzersLimit) {
      return {
        allowed: false,
        reason: 'FOLLOW_LIMIT_REACHED',
        limit: entitlements.followAnalyzersLimit,
        current: currentCount,
        upgradePackage: 'pro_trader',
      };
    }

    return {
      allowed: true,
      limit: entitlements.followAnalyzersLimit,
      current: currentCount,
    };
  }

  /**
   * Check if user can follow symbols
   */
  static async checkCanFollowSymbol(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canFollowSymbols) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'pro_trader',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can publish analyses
   */
  static async checkCanPublishAnalysis(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canPublishAnalyses) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'analyzer_pro',
      };
    }

    // Check daily limit if exists
    if (entitlements.publishLimitPerDay !== null) {
      const supabase = createServerClient();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('analyses')
        .select('*', { count: 'exact', head: true })
        .eq('analyzer_id', userId)
        .gte('created_at', today.toISOString());

      const todayCount = count || 0;

      if (todayCount >= entitlements.publishLimitPerDay) {
        return {
          allowed: false,
          reason: 'DAILY_LIMIT_REACHED',
          limit: entitlements.publishLimitPerDay,
          current: todayCount,
          upgradePackage: 'analyzer_elite',
        };
      }

      return {
        allowed: true,
        limit: entitlements.publishLimitPerDay,
        current: todayCount,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can edit analysis (5-minute window)
   */
  static async checkCanEditAnalysis(
    userId: string,
    analysisId: string
  ): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canEdit5Min) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'analyzer_pro',
      };
    }

    // Check if within 5-minute window
    const supabase = createServerClient();
    const { data: analysis } = await supabase
      .from('analyses')
      .select('created_at, analyzer_id')
      .eq('id', analysisId)
      .eq('analyzer_id', userId)
      .maybeSingle();

    if (!analysis) {
      return {
        allowed: false,
        reason: 'ANALYSIS_NOT_FOUND',
      };
    }

    const createdAt = new Date(analysis.created_at);
    const now = new Date();
    const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / 1000 / 60;

    if (minutesSinceCreation > 5) {
      return {
        allowed: false,
        reason: 'EDIT_WINDOW_EXPIRED',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can add extended targets
   */
  static async checkCanAddExtendedTarget(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canExtendedTargets) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'analyzer_pro',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can post live updates
   */
  static async checkCanPostLiveUpdate(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canLiveAnalysisMode) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'analyzer_pro',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can view live index updates
   */
  static async checkCanViewLiveIndexUpdates(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canLiveIndexRead) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'pro_trader',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can add more Telegram channels
   */
  static async checkCanAddTelegramChannel(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || entitlements.telegramChannelsLimit === 0) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'analyzer_pro',
      };
    }

    // Check current channel count
    const supabase = createServerClient();
    const { count } = await supabase
      .from('telegram_channels')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const currentCount = count || 0;

    if (currentCount >= entitlements.telegramChannelsLimit) {
      return {
        allowed: false,
        reason: 'CHANNEL_LIMIT_REACHED',
        limit: entitlements.telegramChannelsLimit,
        current: currentCount,
        upgradePackage: entitlements.telegramChannelsLimit < 4 ? 'analyzer_elite' : undefined,
      };
    }

    return {
      allowed: true,
      limit: entitlements.telegramChannelsLimit,
      current: currentCount,
    };
  }

  /**
   * Check if user can export data
   */
  static async checkCanExport(userId: string): Promise<EntitlementCheck> {
    const entitlements = await this.getUserEntitlements(userId);

    if (!entitlements || !entitlements.canExport) {
      return {
        allowed: false,
        reason: 'FEATURE_NOT_AVAILABLE',
        upgradePackage: 'pro_trader',
      };
    }

    return { allowed: true };
  }

  /**
   * Refresh user's entitlements cache
   */
  static async refreshUserEntitlements(userId: string): Promise<void> {
    const supabase = createServerClient();

    await supabase.rpc('refresh_user_limits_cache', {
      p_user_id: userId,
    });
  }
}
