'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, ArrowRight, Clock } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Analysis {
  ticker:    string
  title:     string
  analyst:   string
  timestamp: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  type:      'options' | 'stock' | 'index'
  target:    string
  entry:     string
}

const ANALYSES: Analysis[] = [
  {
    ticker: 'SPX',   title: 'Break above 5,900 — continuation setup', analyst: 'Ahmad K.',
    timestamp: '2h ago', sentiment: 'bullish', type: 'index',   target: '5,980', entry: '5,842',
  },
  {
    ticker: 'AAPL',  title: 'Supply zone rejection — short-term pullback', analyst: 'Sara M.',
    timestamp: '4h ago', sentiment: 'bearish', type: 'stock',   target: '210', entry: '228',
  },
  {
    ticker: 'NVDA',  title: 'AI momentum + earnings catalyst call setup', analyst: 'Khalid R.',
    timestamp: '5h ago', sentiment: 'bullish', type: 'options', target: '$42.50', entry: '$28.30',
  },
  {
    ticker: 'NDX',   title: 'Tech rotation into mega-caps — index trade', analyst: 'Layla T.',
    timestamp: '7h ago', sentiment: 'bullish', type: 'index',   target: '21,000', entry: '20,431',
  },
  {
    ticker: 'TSLA',  title: 'Earnings week volatility — straddle opportunity', analyst: 'Omar S.',
    timestamp: '9h ago', sentiment: 'neutral', type: 'options', target: '$32.00', entry: '$18.50',
  },
  {
    ticker: 'GLD',   title: 'Gold breakout above $2,600 resistance', analyst: 'Nora F.',
    timestamp: '12h ago', sentiment: 'bullish', type: 'stock',  target: '$2,720', entry: '$2,648',
  },
]

const SENTIMENT_MAP = {
  bullish: { label: 'Bullish', color: '#3FB950', bg: 'rgba(63,185,80,0.12)', icon: TrendingUp  },
  bearish: { label: 'Bearish', color: '#F85149', bg: 'rgba(248,81,73,0.12)', icon: TrendingDown },
  neutral: { label: 'Neutral', color: '#E3B341', bg: 'rgba(227,179,65,0.12)', icon: TrendingUp  },
}

const TYPE_MAP = {
  options: { label: 'OPTIONS', color: '#58A6FF', bg: 'rgba(88,166,255,0.12)' },
  stock:   { label: 'STOCK',   color: '#E3B341', bg: 'rgba(227,179,65,0.12)' },
  index:   { label: 'INDEX',   color: '#A371F7', bg: 'rgba(163,113,247,0.12)' },
}

export function LatestAnalyses() {
  return (
    <section className="py-20 relative">
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
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5 rounded-sm mb-3">
              <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Latest Analyses</span>
            </div>
            <h2 className="text-3xl font-black text-foreground tracking-tight">Fresh from top analysts</h2>
          </div>
          <Link href="/dashboard/feed" className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-sm text-xs border-border gap-1.5">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </motion.div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ANALYSES.map((a, i) => {
            const S = SENTIMENT_MAP[a.sentiment]
            const T = TYPE_MAP[a.type]
            const SIcon = S.icon
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group bg-card border border-border rounded-sm p-4 hover:border-primary/30 transition-all cursor-pointer"
              >
                {/* Top row: ticker + type + sentiment */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-black text-foreground w-12">{a.ticker}</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ color: T.color, background: T.bg }}
                  >{T.label}</span>
                  <span
                    className="ml-auto flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded"
                    style={{ color: S.color, background: S.bg }}
                  >
                    <SIcon className="h-2.5 w-2.5" />
                    {S.label}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xs font-semibold text-foreground leading-snug mb-3 group-hover:text-primary transition-colors line-clamp-2">
                  {a.title}
                </h3>

                {/* Entry / Target row */}
                <div className="flex items-center gap-4 mb-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Entry</div>
                    <div className="text-xs font-bold text-foreground num">{a.entry}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">→</div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Target</div>
                    <div className="text-xs font-bold num" style={{ color: S.color }}>{a.target}</div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border pt-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/50 flex-shrink-0" />
                    <span className="text-[11px] font-semibold text-foreground">{a.analyst}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {a.timestamp}
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
              View All Analyses <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
