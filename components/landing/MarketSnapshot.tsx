'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface MarketCard {
  sym:    string
  name:   string
  val:    string
  chg:    string
  chgAbs: string
  up:     boolean
  path:   string  // SVG sparkline path (viewBox 0 0 80 32)
  type:   'index' | 'vix' | 'stock'
}

const STATIC_META: Omit<MarketCard, 'val' | 'chg' | 'chgAbs' | 'up'>[] = [
  { sym: 'SPX',  name: 'S&P 500',          type: 'index', path: 'M0,28 L10,24 L20,20 L30,22 L40,16 L50,12 L60,14 L70,8 L80,4' },
  { sym: 'NDX',  name: 'NASDAQ 100',        type: 'index', path: 'M0,30 L10,26 L20,22 L30,18 L40,20 L50,14 L60,10 L70,6 L80,3' },
  { sym: 'DJI',  name: 'Dow Jones',         type: 'index', path: 'M0,26 L10,23 L20,20 L30,22 L40,18 L50,16 L60,18 L70,14 L80,10' },
  { sym: 'VIX',  name: 'Volatility Index',  type: 'vix',   path: 'M0,6 L10,10 L20,14 L30,12 L40,18 L50,20 L60,18 L70,24 L80,28' },
  { sym: 'AAPL', name: 'Apple Inc.',        type: 'stock', path: 'M0,28 L10,24 L20,22 L30,18 L40,14 L50,16 L60,10 L70,8 L80,5' },
  { sym: 'NVDA', name: 'NVIDIA Corp.',      type: 'stock', path: 'M0,30 L10,26 L20,20 L30,16 L40,12 L50,8 L60,10 L70,6 L80,2' },
]

function fmt(price: number): string {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return price.toFixed(2)
}

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
      <path d={`${path} L80,32 L0,32 Z`} fill={`url(#${gradId})`} />
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
  const [markets, setMarkets] = useState<MarketCard[]>([])
  const [loading, setLoading] = useState(true)
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      const results = await Promise.allSettled(
        STATIC_META.map(async (meta) => {
          const isIndex = meta.type === 'index' || meta.type === 'vix'
          const url = isIndex
            ? `/api/indices/index-price?symbol=${meta.sym}`
            : `/api/stock-price?symbol=${meta.sym}`

          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()

          const price: number = data.price ?? 0
          const changePercent: number = data.changePercent ?? 0
          const change: number = data.change ?? 0
          const up = changePercent >= 0

          const card: MarketCard = {
            ...meta,
            val: fmt(price),
            chg: `${up ? '+' : ''}${changePercent.toFixed(2)}%`,
            chgAbs: `${up ? '+' : ''}${change.toFixed(2)}`,
            up,
          }

          // Use first successful market status to determine open/closed
          if (marketOpen === null && data.marketStatus) {
            setMarketOpen(data.marketStatus === 'open' || data.marketStatus === 'extended-hours')
          }

          return card
        })
      )

      const resolved = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        // Fallback placeholder on error
        return {
          ...STATIC_META[i],
          val: '—',
          chg: '—',
          chgAbs: '—',
          up: true,
        } as MarketCard
      })

      setMarkets(resolved)
      setLoading(false)
    }

    fetchAll()
  }, [])

  const isOpen = marketOpen ?? false

  return (
    <section className="py-10 border-y border-border bg-card/30">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Label row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Market Snapshot
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!loading && (
              <>
                <div
                  className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}
                />
                <span
                  className={`text-[10px] font-bold tracking-wide ${isOpen ? 'text-emerald-500' : 'text-slate-500'}`}
                >
                  {isOpen ? 'MARKETS OPEN' : 'MARKETS CLOSED'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {loading
            ? STATIC_META.map((m) => (
                <div
                  key={m.sym}
                  className="bg-card border border-border rounded-sm p-3 animate-pulse"
                >
                  <div className="h-3 w-10 bg-muted rounded mb-2" />
                  <div className="h-2 w-16 bg-muted/60 rounded mb-3" />
                  <div className="h-4 w-14 bg-muted rounded mb-2" />
                  <div className="h-2 w-10 bg-muted/60 rounded" />
                </div>
              ))
            : markets.map((m, i) => (
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
                      <div className={`text-xs font-bold num ${m.up ? 'text-emerald-500' : 'text-red-500'}`}>
                        {m.chg}
                      </div>
                      <div className={`text-[10px] num ${m.up ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                        {m.chgAbs}
                      </div>
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
