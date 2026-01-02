'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Users, FileText, Settings, BarChart3, UserCog, Plus, TrendingUp, Search, Bell, Shield, User, Package, Trophy, DollarSign, UserCheck } from 'lucide-react'
import { RoleName } from '@/lib/types/database'
import { useTranslation } from '@/lib/i18n/language-context'

interface NavItem {
  titleKey: string
  href: string | ((userId: string) => string)
  icon: React.ComponentType<{ className?: string }>
  roles: RoleName[]
  tutorialTarget?: string
}

const navItems: NavItem[] = [
  {
    titleKey: 'nav.dashboard',
    href: '/dashboard',
    icon: Home,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
  {
    titleKey: 'nav.feed',
    href: '/dashboard/feed',
    icon: TrendingUp,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'feed',
  },
  {
    titleKey: 'nav.profile',
    href: (userId: string) => `/dashboard/profile/${userId}`,
    icon: User,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'profile',
  },
  {
    titleKey: 'nav.search',
    href: '/dashboard/search',
    icon: Search,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'search',
  },
  {
    titleKey: 'nav.activity',
    href: '/dashboard/activity',
    icon: Bell,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'notifications',
  },
  {
    titleKey: 'nav.rankings',
    href: '/dashboard/rankings',
    icon: Trophy,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
  {
    titleKey: 'nav.subscriptions',
    href: '/dashboard/subscriptions',
    icon: Package,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
  {
    titleKey: 'nav.subscribers',
    href: '/dashboard/subscribers',
    icon: UserCheck,
    roles: ['SuperAdmin', 'Analyzer'],
  },
  {
    titleKey: 'nav.financial',
    href: '/dashboard/financial',
    icon: DollarSign,
    roles: ['SuperAdmin', 'Analyzer'],
  },
  {
    titleKey: 'nav.create',
    href: '/dashboard/create-analysis',
    icon: Plus,
    roles: ['SuperAdmin', 'Analyzer'],
    tutorialTarget: 'create',
  },
  {
    titleKey: 'nav.admin',
    href: '/dashboard/admin',
    icon: Shield,
    roles: ['SuperAdmin'],
  },
  {
    titleKey: 'nav.settings',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
]

interface SidebarProps {
  userRole: RoleName
  userId: string
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ userRole, userId, className, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const filteredNavItems = navItems.filter(item =>
    item.roles.includes(userRole)
  )

  const getTitle = (titleKey: string) => {
    const keys = titleKey.split('.')
    let value: any = t
    for (const key of keys) {
      value = value[key]
    }
    return value
  }

  return (
    <aside className={cn("w-64 border-r bg-slate-50 dark:bg-slate-900 hidden lg:block", className)}>
      <nav className="space-y-1 p-4">
        {filteredNavItems.map((item) => {
          const Icon = item.icon
          const href = typeof item.href === 'function' ? item.href(userId) : item.href
          const isActive = pathname === href

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              {...(item.tutorialTarget ? { 'data-tutorial': item.tutorialTarget } : {})}
              className={cn(
                'flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg text-base sm:text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <Icon className="h-5 w-5 sm:h-5 sm:w-5" />
              <span>{getTitle(item.titleKey)}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export { navItems }
