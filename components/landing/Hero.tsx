'use client'

import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { ArrowRight, Shield, TrendingUp, BarChart3, Users, Bell, CheckCircle2, Zap, Activity } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/language-context'

const STATS = [
  { label: 'Active Analysts', value: '1,200+' },
  { label: 'Avg Win Rate',    value: '68.4%'  },
  { label: 'Trades Tracked', value: '94K+'   },
  { label: 'Options Alerts', value: '12K+'   },
]

const PILLS = [
  { icon: CheckCircle2, label: 'Auto-validated signals' },
  { icon: TrendingUp,   label: 'Ranked performance'    },
  { icon: Users,        label: 'Follow top analysts'   },
  { icon: Bell,         label: 'Real-time alerts'      },
]

const MOCK_MARKET = [
  { sym: 'SPX',  val: '5,842.47', chg: '+1.24%', up: true  },
  { sym: 'NDX',  val: '20,431.18',chg: '+1.87%', up: true  },
  { sym: 'VIX',  val: '14.32',    chg: '-8.43%', up: false },
]

const MOCK_TRADES = [
  { sym: 'SPY',  type: 'CALL', strike: 590,  exp: 'Mar 21', pl: '+$340', pct: '+18.2%', status: 'ACTIVE',     analyst: 'Ahmad K.' },
  { sym: 'AAPL', type: 'PUT',  strike: 185,  exp: 'Mar 28', pl: '+$820', pct: '+41.0%', status: 'TARGET HIT', analyst: 'Sara M.'  },
  { sym: 'NVDA', type: 'CALL', strike: 900,  exp: 'Apr 04', pl: '-$120', pct: '-8.0%',  status: 'STOPPED',    analyst: 'Khalid R.'},
]

const CHART_PATH = 'M0,52 L18,48 L36,42 L54,38 L72,40 L90,32 L108,26 L126,29 L144,20 L162,16 L180,19 L198,12 L216,8 L234,5 L252,10 L270,4 L290,2'

export function Hero() {
  const { t } = useTranslation()

  return (
    <section className="relative overflow-hidden pt-24 pb-12 sm:pt-28 sm:pb-16 bg-background">
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
        }}
      />
      {/* Glow */}
      <div
        className="absolute -top-32 left-1/3 w-[700px] h-[400px] opacity-[0.07] dark:opacity-[0.12] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, hsl(25 100% 52%), transparent 70%)' }}
      />

      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* ── LEFT PANEL ─────────────────────────────────────────── */}
          <div className="flex flex-col">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/30 bg-primary/5 rounded-sm">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
                  {t.landing.hero.badge}
                </span>
              </div>
            </motion.div>

            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="mb-5"
            >
              <Image
                src="/analyzer-logo.png"
                alt="AnalyzingHub"
                width={260}
                height={87}
                className="h-14 w-auto"
                priority
              />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl font-black leading-[1.06] tracking-tight text-foreground mb-4"
            >
              {t.landing.hero.heading}{' '}
              <span className="text-primary">{t.landing.hero.headingHighlight}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8 max-w-lg"
            >
              {t.landing.hero.subheading}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-3 mb-10"
            >
              <Link href="/register">
                <Button size="lg" className="h-11 px-8 rounded-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm tracking-wide gap-2 w-full sm:w-auto">
                  {t.landing.hero.getStarted}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard/feed">
                <Button size="lg" variant="outline" className="h-11 px-8 rounded-sm text-sm font-medium border-border hover:border-primary/40 hover:bg-primary/5 w-full sm:w-auto">
                  {t.landing.hero.exploreAnalyses}
                </Button>
              </Link>
            </motion.div>

            {/* Stats bar */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded-sm overflow-hidden mb-8"
            >
              {STATS.map(s => (
                <div key={s.label} className="bg-card flex flex-col items-center py-3 px-2">
                  <span className="text-xl sm:text-2xl font-black text-primary num">{s.value}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-2"
            >
              {PILLS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border bg-card rounded-sm">
                  <Icon className="h-3 w-3 text-primary flex-shrink-0" />
                  <span className="text-[11px] font-medium text-foreground">{label}</span>
                </div>
              ))}
            </motion.div>

            {/* Disclaimer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex items-center gap-2 mt-6"
            >
              <Shield className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t.landing.hero.disclaimer}
              </p>
            </motion.div>
          </div>

          {/* ── RIGHT PANEL — Dashboard Mockup ─────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            {/* Floating alert card — top left */}
            <div className="absolute -left-6 top-10 z-20 bg-[#161B22] border border-[#30363D] rounded-xl p-3 shadow-2xl min-w-[160px]">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 tracking-wide">TARGET HIT</span>
              </div>
              <div className="text-xs font-black text-white">AAPL PUT $185</div>
              <div className="text-[11px] text-emerald-400 font-bold mt-0.5">+41.0% · +$820</div>
              <div className="text-[10px] text-[#6E7681] mt-0.5">by Sara M.</div>
            </div>

            {/* Floating P/L card — bottom right */}
            <div className="absolute -right-4 bottom-12 z-20 bg-[#161B22] border border-[#30363D] rounded-xl p-3 shadow-2xl min-w-[140px]">
              <div className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wide mb-1">Win Rate</div>
              <div className="text-2xl font-black text-emerald-400">68.4%</div>
              <div className="text-[10px] text-[#6E7681] mt-0.5">Across all analysts</div>
            </div>

            {/* Main terminal card */}
            <div className="relative bg-[#0D1117] rounded-2xl border border-[#30363D] shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden">
              {/* Chrome bar */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#21262D] bg-[#161B22]">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-3 text-[10px] font-mono text-[#6E7681] tracking-wide flex-1">ANALYZINGHUB — TERMINAL</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400">LIVE</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Market mini-cards */}
                <div className="grid grid-cols-3 gap-2">
                  {MOCK_MARKET.map(m => (
                    <div key={m.sym} className="bg-[#161B22] rounded-lg p-2.5 border border-[#21262D]">
                      <div className="text-[10px] text-[#6E7681] font-semibold tracking-wide mb-1">{m.sym}</div>
                      <div className="text-[13px] font-black text-[#E6EDF3] num leading-tight">{m.val}</div>
                      <div className={`text-[11px] font-bold num mt-0.5 ${m.up ? 'text-emerald-400' : 'text-red-400'}`}>{m.chg}</div>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div className="bg-[#161B22] rounded-lg border border-[#21262D] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#E6EDF3]">SPX</span>
                      <span className="text-[10px] text-[#6E7681]">1D</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-emerald-400 num">5,842.47</span>
                      <span className="text-[10px] font-bold text-emerald-400">+1.24%</span>
                    </div>
                  </div>
                  <svg viewBox="0 0 290 56" className="w-full h-12" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3FB950" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#3FB950" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`${CHART_PATH} L290,56 L0,56 Z`}
                      fill="url(#hGrad)"
                    />
                    <path
                      d={CHART_PATH}
                      fill="none"
                      stroke="#3FB950"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Last point dot */}
                    <circle cx="290" cy="2" r="2.5" fill="#3FB950" />
                  </svg>
                </div>

                {/* Trade rows */}
                <div className="bg-[#161B22] rounded-lg border border-[#21262D] overflow-hidden">
                  <div className="flex items-center px-3 py-1.5 border-b border-[#21262D]">
                    <span className="text-[10px] font-bold text-[#6E7681] uppercase tracking-wider">Active Signals</span>
                    <span className="ml-auto text-[10px] text-[#6E7681]">3 of 1,200+</span>
                  </div>
                  <div className="divide-y divide-[#21262D]">
                    {MOCK_TRADES.map((row, i) => (
                      <div key={i} className="flex items-center px-3 py-2 gap-2 text-[11px]">
                        <span className="w-8 font-black text-[#E6EDF3]">{row.sym}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          row.type === 'CALL'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}>{row.type}</span>
                        <span className="text-[#8B949E] num flex-shrink-0">${row.strike} · {row.exp}</span>
                        <span className={`ml-auto font-bold num ${row.pl.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.pl}
                        </span>
                        <span className={`text-[10px] font-bold tracking-wide flex-shrink-0 ${
                          row.status === 'TARGET HIT' ? 'text-emerald-400'
                          : row.status === 'STOPPED'  ? 'text-red-400'
                          : 'text-amber-400'
                        }`}>{row.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3 text-[#6E7681]" />
                    <span className="text-[10px] text-[#6E7681]">Auto-validated · Live data</span>
                  </div>
                  <span className="text-[10px] text-primary font-semibold">View all →</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
