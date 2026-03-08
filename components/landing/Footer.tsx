'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Twitter, Github, Linkedin, Mail, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

const FOOTER_COLS = [
  {
    heading: 'Platform',
    links: [
      { label: 'Market Analyses',    href: '/dashboard/feed' },
      { label: 'Live Trades',        href: '/dashboard/feed' },
      { label: 'Options Signals',    href: '/dashboard/feed' },
      { label: 'Analyst Rankings',   href: '/dashboard/feed' },
      { label: 'Pricing',            href: '#pricing'        },
    ],
  },
  {
    heading: 'Markets',
    links: [
      { label: 'S&P 500 (SPX)',      href: '/dashboard/feed' },
      { label: 'NASDAQ (NDX)',       href: '/dashboard/feed' },
      { label: 'Dow Jones (DJI)',    href: '/dashboard/feed' },
      { label: 'Stocks',            href: '/dashboard/feed' },
      { label: 'Options',           href: '/dashboard/feed' },
    ],
  },
  {
    heading: 'Analysts',
    links: [
      { label: 'Become an Analyst',  href: '/register'       },
      { label: 'Top Leaderboard',    href: '/dashboard/feed' },
      { label: 'How it Works',       href: '#how-it-works'   },
      { label: 'Performance Metrics',href: '/dashboard/feed' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy',     href: '#' },
      { label: 'Terms of Service',   href: '#' },
      { label: 'Disclaimer',         href: '#' },
      { label: 'Cookie Policy',      href: '#' },
    ],
  },
]

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-border bg-card/30">
      <div className="container mx-auto px-4 sm:px-6">

        {/* Main grid */}
        <div className="py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">

          {/* Brand column */}
          <div>
            <Link href="/" className="inline-block mb-4">
              <Image
                src="/analyzer-logo.png"
                alt="AnalyzingHub Logo"
                width={160}
                height={53}
                className="h-9 w-auto"
              />
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5 max-w-[220px]">
              Professional trading analysis platform. Market analyses, live trade tracking, and options intelligence — all in one place.
            </p>
            {/* Social icons */}
            <div className="flex gap-2">
              {[
                { icon: Twitter,  label: 'Twitter',  href: '#' },
                { icon: Github,   label: 'GitHub',   href: '#' },
                { icon: Linkedin, label: 'LinkedIn', href: '#' },
                { icon: Mail,     label: 'Email',    href: '#' },
              ].map(s => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <s.icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_COLS.map(col => (
            <div key={col.heading}>
              <h4 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-4">{col.heading}</h4>
              <ul className="space-y-2.5">
                {col.links.map(link => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                    >
                      {link.label}
                      {link.href.startsWith('/dashboard') && (
                        <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            &copy; {new Date().getFullYear()} AnalyzingHub. All rights reserved.
          </p>
          <p className="text-[11px] text-muted-foreground text-center sm:text-right">
            Educational content only. Not financial advice. Trade responsibly.
          </p>
        </div>
      </div>
    </footer>
  )
}
