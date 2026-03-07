'use client'

import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { ArrowRight, Shield, TrendingUp, BarChart3, Users, Bell, CheckCircle2, Zap } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/language-context'

/* Performance stats — institutional proof points */
const STATS = [
  { label: 'Active Analysts', value: '1,200+' },
  { label: 'Avg Win Rate', value: '68.4%' },
  { label: 'Trades Tracked', value: '94K+' },
  { label: 'Platform Uptime', value: '99.9%' },
]

/* Feature pillars */
const FEATURES = [
  { icon: CheckCircle2, label: 'Auto-validated signals' },
  { icon: TrendingUp, label: 'Ranked performance' },
  { icon: Users, label: 'Follow top analysts' },
  { icon: Bell, label: 'Real-time alerts' },
]

export function Hero() {
  const { t } = useTranslation()

  return (
    <section className="relative overflow-hidden pt-32 sm:pt-36 pb-16 bg-background">
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Orange glow — Bloomberg accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-10 dark:opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, hsl(25 100% 52%), transparent 70%)' }}
      />

      <div className="container relative mx-auto px-4 sm:px-6">

        {/* Logo + badge row */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center mb-10"
        >
          <Image
            src="/analyzer-logo.png"
            alt="AnalyzingHub"
            width={340}
            height={113}
            className="h-20 sm:h-28 w-auto mb-6"
            priority
          />
          <div className="flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5 rounded-sm">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
              {t.landing.hero.badge}
            </span>
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-6"
        >
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-foreground">
            {t.landing.hero.heading}{' '}
            <span className="text-primary">
              {t.landing.hero.headingHighlight}
            </span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t.landing.hero.subheading}
          </p>
        </motion.div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12"
        >
          <Link href="/register">
            <Button size="lg" className="h-11 px-8 rounded-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm tracking-wide gap-2">
              {t.landing.hero.getStarted}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/dashboard/feed">
            <Button size="lg" variant="outline" className="h-11 px-8 rounded-sm text-sm font-medium border-border hover:border-primary/40 hover:bg-primary/5">
              {t.landing.hero.exploreAnalyses}
            </Button>
          </Link>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-sm overflow-hidden mb-12 max-w-3xl mx-auto"
        >
          {STATS.map(stat => (
            <div key={stat.label} className="bg-card flex flex-col items-center py-4 px-3">
              <span className="text-2xl sm:text-3xl font-black text-primary num">{stat.value}</span>
              <span className="section-label mt-1">{stat.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3 mb-10"
        >
          {FEATURES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3 py-1.5 border border-border bg-card rounded-sm"
            >
              <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-foreground">{label}</span>
            </div>
          ))}
        </motion.div>

        {/* Terminal preview card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          <div className="border border-border rounded-sm bg-card overflow-hidden shadow-2xl">
            {/* Terminal titlebar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-2 text-[10px] font-mono text-muted-foreground tracking-wide">ANALYZINGHUB TERMINAL — LIVE FEED</span>
            </div>

            {/* Simulated trade rows */}
            <div className="divide-y divide-border">
              {[
                { sym: 'SPY', type: 'CALL', strike: 590, exp: 'Mar 21', analyst: 'Ahmad K.', rate: '74%', status: 'ACTIVE', dir: 'up' },
                { sym: 'AAPL', type: 'PUT', strike: 185, exp: 'Mar 28', analyst: 'Sara M.', rate: '81%', status: 'TARGET HIT', dir: 'up' },
                { sym: 'QQQ', type: 'CALL', strike: 510, exp: 'Apr 04', analyst: 'Khalid R.', rate: '68%', status: 'ACTIVE', dir: 'up' },
                { sym: 'NVDA', type: 'CALL', strike: 900, exp: 'Mar 21', analyst: 'Layla T.', rate: '77%', status: 'STOPPED', dir: 'down' },
              ].map((row, i) => (
                <div key={i} className="flex items-center px-4 py-2.5 gap-3 text-xs hover:bg-muted/20 transition-colors">
                  <div className="w-12 font-black text-foreground">{row.sym}</div>
                  <div>
                    <span className={row.type === 'CALL' ? 'badge-buy' : 'badge-sell'}>{row.type}</span>
                  </div>
                  <div className="text-muted-foreground num flex-shrink-0">${row.strike} · {row.exp}</div>
                  <div className="flex-1 hidden sm:block text-muted-foreground">{row.analyst}</div>
                  <div className="hidden md:block">
                    <span className="text-emerald-500 font-bold">{row.rate}</span>
                    <span className="text-muted-foreground ml-1 text-[10px]">win rate</span>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold tracking-wide ${
                      row.status === 'TARGET HIT' ? 'text-emerald-500' :
                      row.status === 'STOPPED' ? 'text-red-500' : 'text-amber-500'
                    }`}>
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground">Live data · Auto-validated</span>
              </div>
              <span className="text-[10px] text-muted-foreground">4 of 1,200+ signals</span>
            </div>
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-8 flex items-center justify-center gap-2 text-center"
        >
          <Shield className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground max-w-lg leading-relaxed">
            {t.landing.hero.disclaimer}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
