'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { LogOut, User, Settings, Menu } from 'lucide-react'
import { SessionUser } from '@/lib/auth/types'
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useTranslation } from '@/lib/i18n/language-context'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { navItems } from './Sidebar'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getMarketStatus, formatMarketTime, MarketStatus } from '@/lib/market-hours'

interface HeaderProps {
  user: SessionUser
}

function MarketStatusBadge() {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus())
  const [timeStr, setTimeStr] = useState(formatMarketTime())

  useEffect(() => {
    const tick = () => {
      setStatus(getMarketStatus())
      setTimeStr(formatMarketTime())
    }
    tick()
    const interval = setInterval(tick, 30000)
    return () => clearInterval(interval)
  }, [])

  const colorMap: Record<MarketStatus['status'], string> = {
    open: 'text-emerald-400',
    'pre-market': 'text-amber-400',
    'after-hours': 'text-sky-400',
    closed: 'text-slate-400',
  }

  const dotColorMap: Record<MarketStatus['status'], string> = {
    open: 'bg-emerald-400',
    'pre-market': 'bg-amber-400',
    'after-hours': 'bg-sky-400',
    closed: 'bg-slate-400',
  }

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))]">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full flex-shrink-0',
          dotColorMap[status.status],
          status.status === 'open' && 'animate-pulse'
        )}
      />
      <span className={cn('text-xs font-semibold', colorMap[status.status])}>
        {status.status === 'open' ? 'MARKET OPEN' : status.message.toUpperCase()}
      </span>
      <span className="text-xs text-muted-foreground font-mono">{timeStr}</span>
    </div>
  )
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'nav.companies': true,
    'nav.indicesHub': true,
  })

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
      window.location.href = '/login'
    } catch (error) {
      console.error('Sign out error:', error)
      setLoading(false)
    }
  }

  const initials = user.profile.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const filteredNavItems = navItems.filter(item =>
    item.roles.includes(user.role)
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

  return (
    <header
      className="sticky top-0 z-40 w-full border-b"
      style={{
        backgroundColor: 'hsl(var(--header-bg))',
        borderColor: 'hsl(var(--header-border))',
      }}
    >
      <div className="flex h-14 items-center px-4 gap-3 w-full">
        {/* Mobile menu trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="lg:hidden flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Toggle navigation menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 max-w-[85vw] bg-[hsl(var(--sidebar-bg))] border-[hsl(var(--sidebar-border))]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <Image
                src="/analyzer-logo.png"
                alt="AnalyzingHub"
                width={160}
                height={54}
                className="h-9 w-auto"
              />
            </div>
            <nav className="space-y-0.5 p-3">
              {filteredNavItems.map((item) => {
                const Icon = item.icon

                if (item.children) {
                  const isExpanded = expandedSections[item.titleKey]
                  const hasActiveChild = item.children.some(child => {
                    if (child.href) {
                      const childHref = typeof child.href === 'function' ? child.href(user.id) : child.href
                      return pathname.startsWith(childHref)
                    }
                    return false
                  })

                  return (
                    <div key={item.titleKey} className="space-y-0.5">
                      <button
                        onClick={() => toggleSection(item.titleKey)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all w-full',
                          hasActiveChild
                            ? 'text-white bg-white/10'
                            : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-left text-[13px]">{getTitle(item.titleKey)}</span>
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="ml-3 pl-3 space-y-0.5 border-l border-white/10">
                          {item.children.filter(child => child.roles.includes(user.role)).map(child => {
                            const ChildIcon = child.icon
                            const childHref = typeof child.href === 'function' ? child.href(user.id) : child.href!
                            const isActive = pathname === childHref || pathname.startsWith(childHref + '/')

                            return (
                              <Link
                                key={childHref}
                                href={childHref}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                  'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-all',
                                  isActive
                                    ? 'bg-[hsl(var(--primary))] text-white'
                                    : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
                                )}
                              >
                                <ChildIcon className="h-3.5 w-3.5" />
                                <span>{getTitle(child.titleKey)}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                }

                const href = typeof item.href === 'function' ? item.href(user.id) : item.href!
                const isActive = pathname === href

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all',
                      isActive
                        ? 'bg-[hsl(var(--primary))] text-white'
                        : 'text-[hsl(var(--sidebar-fg))] hover:text-white hover:bg-white/8'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{getTitle(item.titleKey)}</span>
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/dashboard" className="flex-shrink-0 mr-2">
          <Image
            src="/analyzer-logo.png"
            alt="AnalyzingHub"
            width={160}
            height={54}
            className="h-8 w-auto"
            priority
          />
        </Link>

        {/* Market status — center */}
        <div className="flex-1 flex items-center">
          <MarketStatusBadge />
        </div>

        {/* Right: user info + actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* User name & role (desktop) */}
          <div className="hidden lg:flex flex-col items-end mr-2">
            <p className="text-xs font-semibold leading-tight">
              {user.profile.full_name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {user.role}
            </p>
          </div>

          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsPanel />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 rounded-full p-0 ml-1"
                aria-label={`${user.profile.full_name} account menu`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.profile.avatar_url || undefined} alt={user.profile.full_name} />
                  <AvatarFallback className="text-[11px] font-bold">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-0.5">
                  <p className="text-sm font-semibold">{user.profile.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">{user.role}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/dashboard/profile/${user.id}`)}>
                <User className="me-2 h-4 w-4" />
                <span>{t.nav.profile}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <Settings className="me-2 h-4 w-4" />
                <span>{t.common.settings}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={loading}>
                <LogOut className="me-2 h-4 w-4" />
                <span>{t.common.logout}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
