'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Twitter, Github, Linkedin, Mail } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'
import { useTheme } from 'next-themes'

export function Footer() {
  const { t } = useTranslation()
  const { theme, resolvedTheme } = useTheme()

  const currentTheme = resolvedTheme || theme
  const logoSrc = currentTheme === 'dark' ? '/chatgpt_image_dec_28,_2025,_02_14_09_pm_(1).png' : '/new_project_(6).png'

  return (
    <footer className="border-t border-border bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="mb-4 flex items-center gap-2">
              <Image
                src={logoSrc}
                alt="AnalyzingHub Logo"
                width={160}
                height={53}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t.landing.hero.description}
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t.landing.footer.features}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#features" className="hover:text-foreground transition-colors">
                  {t.landing.footer.features}
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-foreground transition-colors">
                  {t.landing.howItWorks.title}
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="hover:text-foreground transition-colors">
                  {t.landing.footer.pricing}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t.search.search}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#faq" className="hover:text-foreground transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/dashboard/feed" className="hover:text-foreground transition-colors">
                  {t.analysis.title}
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-foreground transition-colors">
                  {t.landing.hero.getStarted}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground transition-colors">
                  {t.auth.signIn}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">{t.landing.footer.contact}</h3>
            <div className="flex gap-3">
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                aria-label="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
                aria-label="Email"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} AnalyzingHub. All rights reserved.</p>
          <p className="mt-2">
            Educational content only. Not financial advice. Trade responsibly.
          </p>
        </div>
      </div>
    </footer>
  )
}
