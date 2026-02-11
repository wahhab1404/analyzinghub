'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home, Settings, Bell, Shield, User, Package, Trophy, DollarSign, UserCheck,
  LineChart, TrendingUp, Building2, Search, Plus, FileText, BarChart3,
  ChevronDown, ChevronRight, BookOpen
} from 'lucide-react'
import { RoleName } from '@/lib/types/database'
import { useTranslation } from '@/lib/i18n/language-context'
import { useState } from 'react'

interface NavItem {
  titleKey: string
  title?: string
  href?: string | ((userId: string) => string)
  icon: React.ComponentType<{ className?: string }>
  roles: RoleName[]
  tutorialTarget?: string
  children?: NavItem[]
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
    titleKey: 'nav.myProfile',
    href: (userId: string) => `/dashboard/profile/${userId}`,
    icon: User,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'profile',
  },
  {
    titleKey: 'nav.companies',
    icon: Building2,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    children: [
      {
        titleKey: 'nav.exploreCompanies',
        href: '/dashboard/companies',
        icon: Search,
        roles: ['SuperAdmin', 'Analyzer', 'Trader'],
      },
      {
        titleKey: 'nav.companyAnalyses',
        href: '/dashboard/companies/analyses',
        icon: BarChart3,
        roles: ['SuperAdmin', 'Analyzer', 'Trader'],
      },
      {
        titleKey: 'nav.createCompanyAnalysis',
        href: '/dashboard/create-analysis',
        icon: Plus,
        roles: ['SuperAdmin', 'Analyzer'],
        tutorialTarget: 'create',
      },
    ],
  },
  {
    titleKey: 'nav.indicesHub',
    icon: LineChart,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    children: [
      {
        titleKey: 'nav.indicesFeed',
        href: '/dashboard/indices',
        icon: TrendingUp,
        roles: ['SuperAdmin', 'Analyzer', 'Trader'],
      },
      {
        titleKey: 'nav.createIndexAnalysis',
        href: '/dashboard/indices/create',
        icon: Plus,
        roles: ['SuperAdmin', 'Analyzer'],
      },
      {
        titleKey: 'nav.dailyReports',
        href: '/dashboard/reports',
        icon: FileText,
        roles: ['SuperAdmin', 'Analyzer'],
      },
    ],
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
    titleKey: 'nav.activity',
    href: '/dashboard/activity',
    icon: Bell,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
    tutorialTarget: 'notifications',
  },
  {
    titleKey: 'nav.helpTutorials',
    href: '/dashboard/help-tutorials',
    icon: BookOpen,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
  {
    titleKey: 'nav.settings',
    href: '/dashboard/settings',
    icon: Settings,
    roles: ['SuperAdmin', 'Analyzer', 'Trader'],
  },
  {
    titleKey: 'nav.admin',
    href: '/dashboard/admin',
    icon: Shield,
    roles: ['SuperAdmin'],
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'nav.companies': true,
    'nav.indicesHub': true,
  })

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

  const toggleSection = (titleKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [titleKey]: !prev[titleKey]
    }))
  }

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon

    if (item.children) {
      const isExpanded = expandedSections[item.titleKey]
      const hasActiveChild = item.children.some(child => {
        if (child.href) {
          const childHref = typeof child.href === 'function' ? child.href(userId) : child.href
          return pathname.startsWith(childHref)
        }
        return false
      })

      return (
        <div key={item.titleKey} className="space-y-1">
          <button
            onClick={() => toggleSection(item.titleKey)}
            className={cn(
              'flex items-center gap-3 px-3 py-3 sm:py-2 rounded-lg text-base sm:text-sm font-medium transition-colors w-full',
              hasActiveChild
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            )}
          >
            <Icon className="h-5 w-5 sm:h-5 sm:w-5" />
            <span className="flex-1 text-left">{getTitle(item.titleKey)}</span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {isExpanded && (
            <div className="ml-6 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
              {item.children.filter(child => child.roles.includes(userRole)).map(child => {
                const ChildIcon = child.icon
                const childHref = typeof child.href === 'function' ? child.href(userId) : child.href!
                const isActive = pathname === childHref || pathname.startsWith(childHref)

                return (
                  <Link
                    key={childHref}
                    href={childHref}
                    onClick={onNavigate}
                    {...(child.tutorialTarget ? { 'data-tutorial': child.tutorialTarget } : {})}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    )}
                  >
                    <ChildIcon className="h-4 w-4" />
                    <span>{getTitle(child.titleKey)}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    const href = typeof item.href === 'function' ? item.href(userId) : item.href!
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
  }

  return (
    <aside className={cn("w-64 border-r bg-slate-50 dark:bg-slate-900 hidden lg:block", className)}>
      <nav className="space-y-1 p-4">
        {filteredNavItems.map(renderNavItem)}
      </nav>
    </aside>
  )
}

export { navItems }
