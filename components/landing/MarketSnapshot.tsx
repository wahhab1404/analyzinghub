'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface MarketCard {
  sym:   string
  name:  string
  val:   string
  chg:   string
  chgAbs:string
  up:    boolean
  path:  string   // SVG sparkline path (viewBox 0 0 80 32)
  type:  'index' | 'vix' | 'stock'
}

const MARKETS: MarketCard[] = [
  {
    sym: 'SPX', name: 'S&P 500',
    val: '5,842.47', chg: '+1.24%', chgAbs: '+71.34', up: true, type: 'index',
    path: 'M0,28 L10,24 L20,20 L30,22 L40,16 L50,12 L60,14 L70,8 L80,4',
  },
  {
    sym: 'NDX', name: 'NASDAQ 100',
    val: '20,431.18', chg: '+1.87%', chgAbs: '+374.82', up: true, type: 'index',
    path: 'M0,30 L10,26 L20,22 L30,18 L40,20 L50,14 L60,10 L70,6 L80,3',
  },
  {
    sym: 'DJI', name: 'Dow Jones',
    val: '43,128.65', chg: '+0.74%', chgAbs: '+316.19', up: true, type: 'index',
    path: 'M0,26 L10,23 L20,20 L30,22 L40,18 L50,16 L60,18 L70,14 L80,10',
  },
  {
    sym: 'VIX', name: 'Volatility Index',
    val: '14.32', chg: '-8.43%', chgAbs: '-1.32', up: false, type: 'vix',
    path: 'M0,6 L10,10 L20,14 L30,12 L40,18 L50,20 L60,18 L70,24 L80,28',
  },
  {
    sym: 'AAPL', name: 'Apple Inc.',
    val: '228.87', chg: '+2.14%', chgAbs: '+4.82', up: true, type: 'stock',
    path: 'M0,28 L10,24 L20,22 L30,18 L40,14 L50,16 L60,10 L70,8 L80,5',
  },
  {
    sym: 'NVDA', name: 'NVIDIA Corp.',
    val: '875.39', chg: '+3.62%', chgAbs: '+30.65', up: true, type: 'stock',
    path: 'M0,30 L10,26 L20,20 L30,16 L40,12 L50,8 L60,10 L70,6 L80,2',
  },
]

function Sparkline({ path, up }: { path: string; up: boolean }) {
  const color = up ? '#3FB950' : '#F85149'
  const gradId = `sg-${Math.random().toString(36).slice(2, 7)}`
  return (
    <svg viewBox="0 0 80 32" className="w-20 h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L80,32 L0,32 Z`}
        fill={`url(#${gradId})`}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MarketSnapshot() {
  return (
    <section className="py-10 border-y border-border bg-card/30">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Label row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Market Snapshot</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-500 tracking-wide">MARKETS OPEN</span>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {MARKETS.map((m, i) => (
            <motion.div
              key={m.sym}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="bg-card border border-border rounded-sm p-3 hover:border-primary/30 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-xs font-black text-foreground">{m.sym}</div>
                  <div className="text-[10px] text-muted-foreground">{m.name}</div>
                </div>
                {m.up
                  ? <TrendingUp className="h-3 w-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                  : <TrendingDown className="h-3 w-3 text-red-500 flex-shrink-0 mt-0.5" />
                }
              </div>

              {/* Price */}
              <div className="text-sm font-black text-foreground num mb-1">{m.val}</div>

              {/* Change + sparkline */}
              <div className="flex items-end justify-between">
                <div>
                  <div className={`text-xs font-bold num ${m.up ? 'text-emerald-500' : 'text-red-500'}`}>{m.chg}</div>
                  <div className={`text-[10px] num ${m.up ? 'text-emerald-500/70' : 'text-red-500/70'}`}>{m.chgAbs}</div>
                </div>
                <Sparkline path={m.path} up={m.up} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
