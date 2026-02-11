'use client'

import { useState } from 'react'
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

interface HeaderProps {
  user: SessionUser
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
    <header className="border-b bg-white dark:bg-slate-950 sticky top-0 z-40 w-full">
      <div className="flex h-16 sm:h-20 items-center px-3 sm:px-6 w-full max-w-full">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 mr-1">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 max-w-[85vw]">
              <div className="flex items-center gap-2 px-4 py-4 border-b">
                <Image
                  src="/analyzer-logo.png"
                  alt="AnalyzingHub Logo"
                  width={200}
                  height={67}
                  className="h-12 w-auto max-w-full"
                />
              </div>
              <nav className="space-y-1 p-4">
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
                      <div key={item.titleKey} className="space-y-1">
                        <button
                          onClick={() => toggleSection(item.titleKey)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition-colors w-full',
                            hasActiveChild
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="flex-1 text-left">{getTitle(item.titleKey)}</span>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="ml-6 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                            {item.children.filter(child => child.roles.includes(user.role)).map(child => {
                              const ChildIcon = child.icon
                              const childHref = typeof child.href === 'function' ? child.href(user.id) : child.href!
                              const isActive = pathname === childHref || pathname.startsWith(childHref)

                              return (
                                <Link
                                  key={childHref}
                                  href={childHref}
                                  onClick={() => setMobileMenuOpen(false)}
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

                  const href = typeof item.href === 'function' ? item.href(user.id) : item.href!
                  const isActive = pathname === href

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{getTitle(item.titleKey)}</span>
                    </Link>
                  )
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex-shrink-0">
            <Image
              src="/analyzer-logo.png"
              alt="AnalyzingHub Logo"
              width={200}
              height={67}
              className="h-12 w-auto sm:h-16 max-w-[140px] sm:max-w-none"
              priority
            />
          </Link>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
          <div className="hidden md:flex flex-col items-end mr-2">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
              {user.profile.full_name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.role}
            </p>
          </div>
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsPanel />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full p-0">
                <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                  <AvatarImage src={user.profile.avatar_url || undefined} alt={user.profile.full_name} />
                  <AvatarFallback className="text-xs sm:text-sm">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.profile.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
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
