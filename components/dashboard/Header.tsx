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
import { useTheme } from 'next-themes'

interface HeaderProps {
  user: SessionUser
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const { theme, resolvedTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const currentTheme = resolvedTheme || theme
  const logoSrc = currentTheme === 'dark' ? '/chatgpt_image_dec_28,_2025,_02_14_09_pm_(1).png' : '/new_project_(6).png'

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

  return (
    <header className="border-b bg-white dark:bg-slate-950 sticky top-0 z-40 w-full">
      <div className="flex h-14 sm:h-16 items-center px-3 sm:px-6 w-full max-w-full">
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
                  src={logoSrc}
                  alt="AnalyzingHub Logo"
                  width={160}
                  height={53}
                  className="h-10 w-auto max-w-full"
                />
              </div>
              <nav className="space-y-1 p-4">
                {filteredNavItems.map((item) => {
                  const Icon = item.icon
                  const href = typeof item.href === 'function' ? item.href(user.id) : item.href
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

          <Image
            src={logoSrc}
            alt="AnalyzingHub Logo"
            width={160}
            height={53}
            className="h-9 w-auto sm:h-11 max-w-[120px] sm:max-w-none flex-shrink-0"
          />
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
