'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { motion } from 'framer-motion'
import { Menu, TrendingUp, BarChart3, Activity } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

/* Mini market ticker items — purely decorative demo data */
const TICKERS = [
  { sym: 'SPY', val: '591.42', chg: '+0.84%', up: true },
  { sym: 'QQQ', val: '511.78', chg: '+1.12%', up: true },
  { sym: 'VIX', val: '14.23', chg: '-2.10%', up: false },
  { sym: 'GLD', val: '241.05', chg: '+0.31%', up: true },
  { sym: 'DXY', val: '104.21', chg: '-0.18%', up: false },
]

export function Navigation() {
  const { t } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      {/* Ticker bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-7 bg-card border-b border-border overflow-hidden flex items-center">
        <div className="flex items-center gap-4 animate-none px-4 overflow-x-auto scrollbar-hide whitespace-nowrap w-full">
          <span className="section-label flex-shrink-0 text-primary">MARKET</span>
          {TICKERS.map(t => (
            <div key={t.sym} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] font-bold text-foreground">{t.sym}</span>
              <span className="text-[10px] num text-muted-foreground">{t.val}</span>
              <span className={`text-[10px] num font-semibold ${t.up ? 'text-emerald-500' : 'text-red-500'}`}>
                {t.chg}
              </span>
            </div>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 tracking-wide">LIVE</span>
          </div>
        </div>
      </div>

      {/* Main navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-7 left-0 right-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80"
      >
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 flex-shrink-0">
              <Image
                src="/analyzer-logo.png"
                alt="AnalyzingHub Logo"
                width={160}
                height={53}
                className="h-8 w-auto"
                priority
              />
            </Link>

            {/* Desktop nav links */}
            <div className="hidden items-center gap-6 lg:flex">
              {[
                { href: '#features', label: t.landing.footer.features, icon: BarChart3 },
                { href: '#how-it-works', label: t.landing.howItWorks.title, icon: Activity },
                { href: '#pricing', label: t.landing.footer.pricing, icon: TrendingUp },
                { href: '#faq', label: 'FAQ', icon: null },
              ].map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  {link.icon && <link.icon className="h-3 w-3" />}
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right controls */}
            <div className="hidden lg:flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link href="/login">
                <Button variant="ghost" size="sm" className="h-8 px-3 text-xs rounded-sm">
                  {t.auth.signIn}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="h-8 px-4 text-xs rounded-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wide">
                  {t.landing.hero.getStarted}
                </Button>
              </Link>
            </div>

            {/* Mobile */}
            <div className="flex lg:hidden items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-sm">
                    <Menu className="h-4 w-4" />
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] bg-card border-l border-border p-0">
                  <div className="flex items-center h-12 px-4 border-b border-border">
                    <span className="text-[10px] font-black tracking-[0.2em] text-primary uppercase">ANALYZINGHUB</span>
                  </div>
                  <nav className="p-4 flex flex-col gap-1">
                    {[
                      { href: '#features', label: t.landing.footer.features },
                      { href: '#how-it-works', label: t.landing.howItWorks.title },
                      { href: '#pricing', label: t.landing.footer.pricing },
                      { href: '#faq', label: 'FAQ' },
                    ].map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 border-l-2 border-transparent hover:border-primary transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                    <div className="border-t border-border pt-4 mt-3 flex flex-col gap-2">
                      <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="outline" size="sm" className="w-full rounded-sm text-xs">
                          {t.auth.signIn}
                        </Button>
                      </Link>
                      <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                        <Button size="sm" className="w-full rounded-sm text-xs bg-primary hover:bg-primary/90 font-bold">
                          {t.landing.hero.getStarted}
                        </Button>
                      </Link>
                    </div>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </motion.nav>
    </>
  )
}
