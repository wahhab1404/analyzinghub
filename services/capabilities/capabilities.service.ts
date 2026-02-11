import { Database } from '@/lib/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Role = Database['public']['Tables']['roles']['Row'];

export interface UserCapabilities {
  canCreateAnalysis: boolean;
  canEditAnalysis: boolean;
  canDeleteAnalysis: boolean;
  canCreateTrade: boolean;
  canEditTrade: boolean;
  canDeleteTrade: boolean;
  canConnectTelegram: boolean;
  canCreateChannels: boolean;
  canManageSubscribers: boolean;
  canCreatePlans: boolean;
  canManagePlans: boolean;
  canGenerateReports: boolean;
  canAccessIndicesHub: boolean;
  canAccessCompaniesHub: boolean;
  canUseTestingEnvironment: boolean;
  canAccessFinancialDashboard: boolean;
  canManageUsers: boolean;
  canModerateContent: boolean;
  canViewAnalytics: boolean;
  canManageSettings: boolean;
  canRateAnalyzers: boolean;
  canFollowAnalyzers: boolean;
  canCommentOnAnalyses: boolean;
  canViewPublicAnalyses: boolean;
}

export interface UserContext {
  userId: string;
  role: string;
  planTier?: string;
  isActive: boolean;
}

export class CapabilitiesService {
  static getUserCapabilities(context: UserContext): UserCapabilities {
    const { role, planTier, isActive } = context;

    const isAdmin = role === 'admin' || role === 'super_admin';
    const isAnalyzer = role === 'analyzer' || isAdmin;
    const isSubscriber = role === 'subscriber';
    const isAuthenticated = !!context.userId;

    return {
      canCreateAnalysis: isAnalyzer && isActive,
      canEditAnalysis: isAnalyzer && isActive,
      canDeleteAnalysis: isAnalyzer && isActive,

      canCreateTrade: isAnalyzer && isActive,
      canEditTrade: isAnalyzer && isActive,
      canDeleteTrade: isAnalyzer && isActive,

      canConnectTelegram: isAnalyzer && isActive,
      canCreateChannels: isAnalyzer && isActive,
      canManageSubscribers: isAnalyzer && isActive,

      canCreatePlans: isAnalyzer && isActive,
      canManagePlans: isAnalyzer && isActive,

      canGenerateReports: isAnalyzer && isActive,
      canAccessIndicesHub: isAnalyzer && isActive,
      canAccessCompaniesHub: isAnalyzer && isActive,
      canUseTestingEnvironment: isAnalyzer && isActive,

      canAccessFinancialDashboard: isAnalyzer && isActive,

      canManageUsers: isAdmin,
      canModerateContent: isAdmin,
      canViewAnalytics: isAdmin || (isAnalyzer && isActive),
      canManageSettings: isAdmin,

      canRateAnalyzers: isAuthenticated && (isSubscriber || isAnalyzer),
      canFollowAnalyzers: isAuthenticated,
      canCommentOnAnalyses: isAuthenticated,
      canViewPublicAnalyses: true,
    };
  }

  static hasCapability(
    capabilities: UserCapabilities,
    capability: keyof UserCapabilities
  ): boolean {
    return capabilities[capability];
  }

  static hasAnyCapability(
    capabilities: UserCapabilities,
    requiredCapabilities: (keyof UserCapabilities)[]
  ): boolean {
    return requiredCapabilities.some(cap => capabilities[cap]);
  }

  static hasAllCapabilities(
    capabilities: UserCapabilities,
    requiredCapabilities: (keyof UserCapabilities)[]
  ): boolean {
    return requiredCapabilities.every(cap => capabilities[cap]);
  }

  static getAvailableFeatures(capabilities: UserCapabilities): string[] {
    return Object.entries(capabilities)
      .filter(([_, value]) => value)
      .map(([key]) => key);
  }

  static getMissingCapabilities(
    capabilities: UserCapabilities,
    required: (keyof UserCapabilities)[]
  ): (keyof UserCapabilities)[] {
    return required.filter(cap => !capabilities[cap]);
  }
}

export function createCapabilitiesContext(
  profile: Profile & { role?: Role }
): UserContext {
  return {
    userId: profile.id,
    role: profile.role?.name || 'user',
    planTier: profile.plan_tier,
    isActive: profile.is_active ?? true,
  };
}
