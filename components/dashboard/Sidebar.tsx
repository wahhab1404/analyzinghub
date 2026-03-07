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

/* Group definitions — pure visual grouping for Bloomberg-style sidebar */
const navGroups = [
  {
    label: 'OVERVIEW',
    keys: ['nav.dashboard', 'nav.feed', 'nav.myProfile'],
  },
  {
    label: 'MARKETS',
    keys: ['nav.companies', 'nav.indicesHub', 'nav.rankings'],
  },
  {
    label: 'ACCOUNT',
    keys: ['nav.subscriptions', 'nav.subscribers', 'nav.financial', 'nav.activity'],
  },
  {
    label: 'SUPPORT',
    keys: ['nav.helpTutorials', 'nav.settings', 'nav.admin'],
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

  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole))

  const getTitle = (titleKey: string) => {
    const keys = titleKey.split('.')
    let value: any = t
    for (const key of keys) {
      value = value?.[key]
    }
    return value || titleKey
  }

  const toggleSection = (titleKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [titleKey]: !prev[titleKey],
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
        <div key={item.titleKey}>
          <button
            onClick={() => toggleSection(item.titleKey)}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors w-full group',
              hasActiveChild
                ? 'text-foreground bg-primary/8 border-l-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-l-2 border-transparent'
            )}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left tracking-wide uppercase text-[10px] font-semibold">{getTitle(item.titleKey)}</span>
            {isExpanded
              ? <ChevronDown className="h-3 w-3 opacity-50" />
              : <ChevronRight className="h-3 w-3 opacity-50" />
            }
          </button>

          {isExpanded && (
            <div className="ml-3 border-l border-border/50 pl-3 py-0.5 space-y-0.5">
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
                      'flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium transition-colors rounded-none',
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    )}
                  >
                    <ChildIcon className="h-3 w-3 flex-shrink-0" />
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
          'flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors border-l-2',
          isActive
            ? 'border-primary bg-primary/8 text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
        )}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{getTitle(item.titleKey)}</span>
      </Link>
    )
  }

  return (
    <aside className={cn(
      'w-52 border-r border-border bg-card hidden lg:flex flex-col flex-shrink-0',
      className
    )}>
      {/* Brand strip */}
      <div className="flex items-center h-12 px-4 border-b border-border bg-background/50">
        <span className="text-[10px] font-black tracking-[0.2em] text-primary uppercase select-none">
          ANALYZINGHUB
        </span>
      </div>

      {/* Grouped navigation */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-3">
        {navGroups.map(group => {
          const groupItems = filteredNavItems.filter(item => group.keys.includes(item.titleKey))
          if (groupItems.length === 0) return null

          return (
            <div key={group.label}>
              <div className="px-3 py-1.5">
                <p className="section-label">{group.label}</p>
              </div>
              <div className="space-y-0.5">
                {groupItems.map(renderNavItem)}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Bottom status strip */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-medium tracking-wide">LIVE</span>
        </div>
      </div>
    </aside>
  )
}

export { navItems }
