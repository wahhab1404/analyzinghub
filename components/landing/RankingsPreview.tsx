'use client'

import { motion } from 'framer-motion'
import { Trophy, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/language-context'

const ANALYSTS = [
  { rank: 1, name: 'TradeKing_Pro',      wins: 156, losses: 32, winRate: 83.0, avgReturn: '+38.4%', trades: 188, specialty: 'INDEX', badge: 'gold'   },
  { rank: 2, name: 'ChartMaster_Alex',   wins: 142, losses: 38, winRate: 78.9, avgReturn: '+31.2%', trades: 180, specialty: 'OPTIONS', badge: 'silver' },
  { rank: 3, name: 'TechAnalyst_Sam',    wins: 128, losses: 44, winRate: 74.4, avgReturn: '+27.8%', trades: 172, specialty: 'STOCK',  badge: 'bronze' },
  { rank: 4, name: 'CryptoWhale_Joe',    wins: 115, losses: 48, winRate: 70.6, avgReturn: '+22.1%', trades: 163, specialty: 'OPTIONS', badge: null   },
  { rank: 5, name: 'SwingTrader_Lisa',   wins: 98,  losses: 42, winRate: 70.0, avgReturn: '+19.6%', trades: 140, specialty: 'STOCK',  badge: null   },
  { rank: 6, name: 'QuantEdge_Omar',     wins: 91,  losses: 41, winRate: 68.9, avgReturn: '+17.3%', trades: 132, specialty: 'INDEX',  badge: null   },
]

const BADGE_COLORS: Record<string, { bg: string; ring: string; text: string }> = {
  gold:   { bg: 'from-yellow-400 to-amber-500',  ring: 'ring-yellow-400/40', text: 'text-yellow-400'  },
  silver: { bg: 'from-slate-300 to-slate-400',   ring: 'ring-slate-400/40',  text: 'text-slate-300'   },
  bronze: { bg: 'from-orange-400 to-amber-600',  ring: 'ring-orange-400/40', text: 'text-orange-400'  },
}

const SPECIALTY_COLORS: Record<string, string> = {
  INDEX:   '#A371F7',
  OPTIONS: '#58A6FF',
  STOCK:   '#E3B341',
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-cyan-500',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-blue-600',
]

export function RankingsPreview() {
  const { t } = useTranslation()

  return (
    <section id="rankings" className="py-20 relative bg-card/20">
      <div className="container mx-auto px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-end justify-between mb-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-yellow-500/30 bg-yellow-500/5 rounded-sm mb-3">
              <Trophy className="h-3 w-3 text-yellow-500" />
              <span className="text-[10px] font-bold text-yellow-500 tracking-widest uppercase">Top Analysts</span>
            </div>
            <h2 className="text-3xl font-black text-foreground tracking-tight">{t.landing.rankings.heading}</h2>
            <p className="text-muted-foreground text-sm mt-1">{t.landing.rankings.subheading}</p>
          </div>
          <Link href="/dashboard/feed" className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-sm text-xs border-border gap-1.5">
              {t.landing.rankings.viewFullRankings} <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </motion.div>

        {/* Leaderboard grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANALYSTS.map((a, i) => {
            const bc = a.badge ? BADGE_COLORS[a.badge] : null
            return (
              <motion.div
                key={a.rank}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                className={`bg-card border rounded-sm p-4 hover:border-primary/30 transition-all ${
                  a.badge ? 'border-border' : 'border-border'
                }`}
              >
                {/* Top: rank + avatar + name */}
                <div className="flex items-center gap-3 mb-4">
                  {/* Rank */}
                  <div className={`text-xs font-black w-6 text-center flex-shrink-0 ${bc ? bc.text : 'text-muted-foreground'}`}>
                    #{a.rank}
                  </div>

                  {/* Avatar */}
                  <div className={`relative flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i]} flex items-center justify-center ${bc ? 'ring-2 ' + bc.ring : ''}`}>
                    <span className="text-xs font-black text-white">
                      {a.name.charAt(0)}
                    </span>
                    {bc && (
                      <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-br ${bc.bg} flex items-center justify-center`}>
                        <Trophy className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Name + specialty */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground truncate">{a.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: SPECIALTY_COLORS[a.specialty], background: `${SPECIALTY_COLORS[a.specialty]}18` }}
                      >{a.specialty}</span>
                      <div className="flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
                        <span className="text-[10px] text-muted-foreground">{a.trades} trades</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/20 rounded p-2 border border-border text-center">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Win Rate</div>
                    <div className="text-sm font-black text-emerald-500 num">{a.winRate}%</div>
                  </div>
                  <div className="bg-muted/20 rounded p-2 border border-border text-center">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Avg Return</div>
                    <div className="text-sm font-black text-emerald-500 num">{a.avgReturn}</div>
                  </div>
                  <div className="bg-muted/20 rounded p-2 border border-border text-center">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">W / L</div>
                    <div className="text-sm font-black text-foreground num">{a.wins}<span className="text-muted-foreground font-normal text-[10px]">/{a.losses}</span></div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Mobile CTA */}
        <div className="mt-6 text-center sm:hidden">
          <Link href="/dashboard/feed">
            <Button variant="outline" size="sm" className="rounded-sm text-xs border-border gap-1.5">
              Full Rankings <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
