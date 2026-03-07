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
import { LogOut, User, Settings, Menu, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { SessionUser } from '@/lib/auth/types'
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useTranslation } from '@/lib/i18n/language-context'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import { navItems } from './Sidebar'

interface HeaderProps {
  user: SessionUser
}

function MarketClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/New_York',
      }))
      setDate(now.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        timeZone: 'America/New_York',
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="hidden md:flex flex-col items-end leading-tight">
      <span className="text-xs font-mono font-bold text-foreground num">{time}</span>
      <span className="text-[10px] text-muted-foreground tracking-wide">NYSE · {date}</span>
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
      await fetch('/api/auth/logout', { method: 'POST' })
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

  const filteredNavItems = navItems.filter(item => item.roles.includes(user.role))

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

  const roleColor = {
    SuperAdmin: 'text-amber-400',
    Analyzer: 'text-blue-400',
    Trader: 'text-emerald-400',
  }[user.role] ?? 'text-muted-foreground'

  return (
    <header className="border-b border-border bg-card sticky top-0 z-40 w-full">
      <div className="flex h-12 items-center px-3 sm:px-4 w-full gap-3">

        {/* Mobile menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild className="lg:hidden flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 bg-card border-r border-border">
            <div className="flex items-center h-12 px-4 border-b border-border">
              <span className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">ANALYZINGHUB</span>
            </div>
            <nav className="p-3 space-y-0.5">
              {filteredNavItems.map((item) => {
                const Icon = item.icon

                if (item.children) {
                  const isExpanded = expandedSections[item.titleKey]
                  const hasActiveChild = item.children.some(child => {
                    if (child.href) {
                      const href = typeof child.href === 'function' ? child.href(user.id) : child.href
                      return pathname.startsWith(href)
                    }
                    return false
                  })

                  return (
                    <div key={item.titleKey}>
                      <button
                        onClick={() => toggleSection(item.titleKey)}
                        className={cn(
                          'flex items-center gap-2.5 px-2 py-2 text-xs font-medium w-full border-l-2',
                          hasActiveChild
                            ? 'border-primary text-foreground bg-primary/8'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="flex-1 text-left">{getTitle(item.titleKey)}</span>
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </button>

                      {isExpanded && (
                        <div className="ml-3 border-l border-border/50 pl-3 py-0.5 space-y-0.5">
                          {item.children.filter(c => c.roles.includes(user.role)).map(child => {
                            const ChildIcon = child.icon
                            const href = typeof child.href === 'function' ? child.href(user.id) : child.href!
                            const isActive = pathname === href || pathname.startsWith(href)
                            return (
                              <Link
                                key={href}
                                href={href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                  'flex items-center gap-2 px-2 py-1.5 text-xs font-medium',
                                  isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                <ChildIcon className="h-3 w-3" />
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
                      'flex items-center gap-2.5 px-2 py-2 text-xs font-medium border-l-2',
                      isActive
                        ? 'border-primary text-foreground bg-primary/8'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{getTitle(item.titleKey)}</span>
                  </Link>
                )
              })}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/dashboard" className="flex-shrink-0 lg:hidden">
          <Image
            src="/analyzer-logo.png"
            alt="AnalyzingHub"
            width={120}
            height={40}
            className="h-7 w-auto"
            priority
          />
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <MarketClock />

          {/* Market status */}
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 border border-border rounded-sm bg-emerald-500/5">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500 tracking-wide">MARKET OPEN</span>
          </div>

          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsPanel />

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-2 px-2 rounded-sm">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={user.profile.avatar_url || undefined} alt={user.profile.full_name} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold text-foreground leading-none">{user.profile.full_name.split(' ')[0]}</span>
                  <span className={cn('text-[10px] font-bold leading-none tracking-wide', roleColor)}>{user.role.toUpperCase()}</span>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-sm border-border bg-card">
              <DropdownMenuLabel className="py-2">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-xs font-semibold">{user.profile.full_name}</p>
                  <p className="text-[10px] text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push(`/dashboard/profile/${user.id}`)}
                className="text-xs gap-2"
              >
                <User className="h-3.5 w-3.5" />
                <span>{t.nav.profile}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push('/dashboard/settings')}
                className="text-xs gap-2"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>{t.common.settings}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} disabled={loading} className="text-xs gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
                <span>{t.common.logout}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
