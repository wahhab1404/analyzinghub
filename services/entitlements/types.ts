export type PackageKey = 'free_trader' | 'pro_trader' | 'analyzer_pro' | 'analyzer_elite';

export interface PlatformPackage {
  key: PackageKey;
  name: string;
  description: string;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PackageFeature {
  key: string;
  label: string;
  description: string;
}

export interface UserEntitlement {
  id: string;
  userId: string;
  packageKey: PackageKey;
  status: 'active' | 'suspended';
  startedAt: string;
  expiresAt: string | null;
  assignedBy: string | null;
  assignReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementAuditRecord {
  id: string;
  userId: string;
  oldPackageKey: PackageKey | null;
  newPackageKey: PackageKey;
  action: 'assign' | 'upgrade' | 'downgrade' | 'suspend' | 'resume' | 'expire';
  performedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PackageFeatureComparison {
  feature: string;
  freeTrader: boolean | string;
  proTrader: boolean | string;
  analyzerPro: boolean | string;
  analyzerElite: boolean | string;
}
