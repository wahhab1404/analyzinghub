import { RoleName } from '../types/database'

export const ROLES = {
  SUPER_ADMIN: 'SuperAdmin' as const,
  ANALYZER: 'Analyzer' as const,
  TRADER: 'Trader' as const,
}

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  SuperAdmin: 3,
  Analyzer: 2,
  Trader: 1,
}

export function hasRole(userRole: RoleName, requiredRole: RoleName): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function isSuperAdmin(userRole: RoleName): boolean {
  return userRole === ROLES.SUPER_ADMIN
}

export function isAnalyzer(userRole: RoleName): boolean {
  return userRole === ROLES.ANALYZER || isSuperAdmin(userRole)
}

export function isTrader(userRole: RoleName): boolean {
  return userRole === ROLES.TRADER || isAnalyzer(userRole)
}
