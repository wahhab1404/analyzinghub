'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home, Settings, Bell, Shield, User, Package, Trophy, DollarSign, UserCheck,
  LineChart, TrendingUp, Building2, Search, Plus, FileText, BarChart3,
  ChevronDown, ChevronRight, BookOpen, Activity
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
    icon: Activity,
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

  // Group nav items into sections for visual separation
  const tradingItems = filteredNavItems.filter(i =>
    ['nav.companies', 'nav.indicesHub'].includes(i.titleKey)
  )
  const platformItems = filteredNavItems.filter(i =>
    ['nav.dashboard', 'nav.feed', 'nav.myProfile', 'nav.rankings'].includes(i.titleKey)
  )
  const accountItems = filteredNavItems.filter(i =>
    ['nav.subscriptions', 'nav.subscribers', 'nav.financial', 'nav.activity', 'nav.helpTutorials', 'nav.settings', 'nav.admin'].includes(i.titleKey)
  )

  const renderNavItem = (item: NavItem, compact = false) => {
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
        <div key={item.titleKey} className="space-y-0.5">
          <button
            onClick={() => toggleSection(item.titleKey)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 w-full group',
              hasActiveChild
                ? 'text-white bg-white/10'
                : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
            )}
          >
            <Icon className={cn(
              'h-4 w-4 flex-shrink-0 transition-colors',
              hasActiveChild ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--sidebar-fg))]  group-hover:text-white'
            )} />
            <span className="flex-1 text-left text-[13px]">{getTitle(item.titleKey)}</span>
            <span className={cn(
              'transition-transform duration-200',
              isExpanded ? 'rotate-0' : '-rotate-90'
            )}>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </span>
          </button>

          {isExpanded && (
            <div className="ml-3 pl-3 space-y-0.5 border-l border-white/10">
              {item.children.filter(child => child.roles.includes(userRole)).map(child => {
                const ChildIcon = child.icon
                const childHref = typeof child.href === 'function' ? child.href(userId) : child.href!
                const isActive = pathname === childHref || pathname.startsWith(childHref + '/')

                return (
                  <Link
                    key={childHref}
                    href={childHref}
                    onClick={onNavigate}
                    {...(child.tutorialTarget ? { 'data-tutorial': child.tutorialTarget } : {})}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                        : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
                    )}
                  >
                    <ChildIcon className="h-3.5 w-3.5 flex-shrink-0" />
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
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150 group',
          isActive
            ? 'bg-[hsl(var(--primary))] text-white shadow-sm shadow-[hsl(var(--primary)/0.3)]'
            : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
        )}
      >
        <Icon className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors',
          isActive ? 'text-white' : 'text-[hsl(var(--sidebar-fg))] group-hover:text-white'
        )} />
        <span>{getTitle(item.titleKey)}</span>
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        'w-60 hidden lg:flex flex-col',
        'border-r border-[hsl(var(--sidebar-border))]',
        'bg-[hsl(var(--sidebar-bg))]',
        className
      )}
      style={{ minHeight: '100%' }}
    >
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {/* Platform section */}
        {platformItems.length > 0 && (
          <div className="mb-1">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--sidebar-section-fg))]">
              Platform
            </p>
            {platformItems.map(item => renderNavItem(item))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/8 my-3" />

        {/* Trading section */}
        {tradingItems.length > 0 && (
          <div className="mb-1">
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--sidebar-section-fg))]">
              Trading
            </p>
            {tradingItems.map(item => renderNavItem(item))}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-white/8 my-3" />

        {/* Account section */}
        {accountItems.length > 0 && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--sidebar-section-fg))]">
              Account
            </p>
            {accountItems.map(item => renderNavItem(item))}
          </div>
        )}
      </nav>

      {/* Sidebar footer branding */}
      <div className="px-4 py-3 border-t border-white/8">
        <p className="text-[10px] text-[hsl(var(--sidebar-section-fg))] font-medium">
          AnalyzingHub
        </p>
        <p className="text-[9px] text-[hsl(var(--sidebar-section-fg))] opacity-60">
          Professional Trading Intelligence
        </p>
      </div>
    </aside>
  )
}

export { navItems }
