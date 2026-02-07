'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

export function Navigation() {
  const { t } = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-20 sm:h-24 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/analyzer-logo.png"
              alt="AnalyzingHub Logo"
              width={240}
              height={80}
              className="h-16 w-auto sm:h-20"
              priority
            />
          </Link>

          <div className="hidden items-center gap-6 lg:gap-8 lg:flex">
            <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t.landing.footer.features}
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t.landing.howItWorks.title}
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t.landing.footer.pricing}
            </Link>
            <Link href="#faq" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              FAQ
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-2 xl:gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link href="/login">
              <Button variant="ghost" size="sm" className="h-9 px-3">
                {t.auth.signIn}
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="h-9 px-4 bg-gradient-to-r from-primary to-accent text-white hover:opacity-90">
                {t.landing.hero.getStarted}
              </Button>
            </Link>
          </div>

          <div className="flex lg:hidden items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <nav className="flex flex-col gap-4 mt-8">
                  <Link
                    href="#features"
                    className="text-lg font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t.landing.footer.features}
                  </Link>
                  <Link
                    href="#how-it-works"
                    className="text-lg font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t.landing.howItWorks.title}
                  </Link>
                  <Link
                    href="#pricing"
                    className="text-lg font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t.landing.footer.pricing}
                  </Link>
                  <Link
                    href="#faq"
                    className="text-lg font-medium hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    FAQ
                  </Link>
                  <div className="border-t pt-4 mt-4 flex flex-col gap-3">
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" size="lg" className="w-full">
                        {t.auth.signIn}
                      </Button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="lg" className="w-full bg-gradient-to-r from-primary to-accent text-white hover:opacity-90">
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
  )
}
