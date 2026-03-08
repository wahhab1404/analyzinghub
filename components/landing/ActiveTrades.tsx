'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Trade {
  ticker:   string
  assetType:'OPTIONS' | 'STOCK' | 'INDEX'
  direction:'CALL' | 'PUT' | 'LONG' | 'SHORT'
  entry:    string
  current:  string
  highest:  string
  plPct:    string
  plUsd:    string
  status:   'ACTIVE' | 'TARGET HIT' | 'STOPPED' | 'CLOSED'
  analyst:  string
}

const TRADES: Trade[] = [
  { ticker:'SPY',  assetType:'OPTIONS', direction:'CALL',  entry:'$4.20', current:'$7.82', highest:'$8.10', plPct:'+86.2%', plUsd:'+$362', status:'ACTIVE',     analyst:'Ahmad K.'  },
  { ticker:'AAPL', assetType:'OPTIONS', direction:'PUT',   entry:'$3.10', current:'$4.37', highest:'$4.37', plPct:'+41.0%', plUsd:'+$127', status:'TARGET HIT', analyst:'Sara M.'   },
  { ticker:'NDX',  assetType:'INDEX',   direction:'LONG',  entry:'20,200',current:'20,431',highest:'20,551',plPct:'+1.14%', plUsd:'+$231', status:'ACTIVE',     analyst:'Khalid R.' },
  { ticker:'NVDA', assetType:'OPTIONS', direction:'CALL',  entry:'$28.30',current:'$26.10',highest:'$31.40',plPct:'-7.8%',  plUsd:'-$220', status:'ACTIVE',     analyst:'Layla T.'  },
  { ticker:'TSLA', assetType:'STOCK',   direction:'SHORT', entry:'$245.10',current:'$231.44',highest:'$231.44',plPct:'+5.6%',plUsd:'+$136', status:'ACTIVE',   analyst:'Omar S.'   },
]

const STATUS_MAP = {
  'ACTIVE':     { color: '#E3B341', bg: 'rgba(227,179,65,0.12)'  },
  'TARGET HIT': { color: '#3FB950', bg: 'rgba(63,185,80,0.12)'   },
  'STOPPED':    { color: '#F85149', bg: 'rgba(248,81,73,0.12)'   },
  'CLOSED':     { color: '#8B949E', bg: 'rgba(139,148,158,0.12)' },
}

const DIR_MAP = {
  'CALL':  { color: '#3FB950', bg: 'rgba(63,185,80,0.12)'  },
  'LONG':  { color: '#3FB950', bg: 'rgba(63,185,80,0.12)'  },
  'PUT':   { color: '#F85149', bg: 'rgba(248,81,73,0.12)'  },
  'SHORT': { color: '#F85149', bg: 'rgba(248,81,73,0.12)'  },
}

const TYPE_COLORS: Record<string, string> = {
  OPTIONS: '#58A6FF',
  STOCK:   '#E3B341',
  INDEX:   '#A371F7',
}

export function ActiveTrades() {
  return (
    <section className="py-20 relative bg-card/20">
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
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-emerald-500/30 bg-emerald-500/5 rounded-sm mb-3">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-500 tracking-widest uppercase">Live Trades</span>
            </div>
            <h2 className="text-3xl font-black text-foreground tracking-tight">Active trade signals</h2>
            <p className="text-muted-foreground text-sm mt-1">Real positions, real performance, audited in real-time.</p>
          </div>
          <Link href="/dashboard/feed" className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-sm text-xs border-border gap-1.5">
              All Trades <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card border border-border rounded-sm overflow-hidden"
        >
          {/* Table header */}
          <div className="hidden md:grid md:grid-cols-[80px_90px_80px_100px_100px_100px_120px_120px_120px] border-b border-border bg-card/60">
            {['Ticker','Type','Dir','Entry','Current','Highest','P/L %','P/L $','Analyst'].map(h => (
              <div key={h} className="px-3 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider first:pl-4 last:pr-4">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {TRADES.map((t, i) => {
              const S = STATUS_MAP[t.status]
              const D = DIR_MAP[t.direction]
              const isGain = t.plPct.startsWith('+')
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="grid grid-cols-2 md:grid-cols-[80px_90px_80px_100px_100px_100px_120px_120px_120px] px-4 py-3 hover:bg-muted/10 transition-colors items-center gap-y-1"
                >
                  {/* Ticker */}
                  <div className="font-black text-sm text-foreground md:pl-0 flex items-center gap-2">
                    {t.ticker}
                    <span className="md:hidden text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: TYPE_COLORS[t.assetType], background: 'rgba(88,166,255,0.10)' }}>
                      {t.assetType}
                    </span>
                  </div>

                  {/* Type (desktop) */}
                  <div className="hidden md:block">
                    <span className="text-[10px] font-bold" style={{ color: TYPE_COLORS[t.assetType] }}>
                      {t.assetType}
                    </span>
                  </div>

                  {/* Direction */}
                  <div className="hidden md:block">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: D.color, background: D.bg }}>
                      {t.direction}
                    </span>
                  </div>

                  {/* Entry */}
                  <div className="hidden md:block text-xs text-muted-foreground num">{t.entry}</div>

                  {/* Current */}
                  <div className="hidden md:block text-xs font-semibold text-foreground num">{t.current}</div>

                  {/* Highest */}
                  <div className="hidden md:block text-xs text-muted-foreground num">{t.highest}</div>

                  {/* P/L % */}
                  <div className="text-sm font-black num" style={{ color: isGain ? '#3FB950' : '#F85149' }}>
                    {t.plPct}
                  </div>

                  {/* P/L $ */}
                  <div className="text-xs font-bold num" style={{ color: isGain ? '#3FB950' : '#F85149' }}>
                    {t.plUsd}
                  </div>

                  {/* Status + analyst */}
                  <div className="col-span-2 md:col-span-1 flex items-center justify-between md:justify-start md:gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: S.color, background: S.bg }}>
                      {t.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto md:ml-0 hidden md:block">{t.analyst}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border bg-card/40 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Showing 5 of 1,200+ active signals</span>
            <Link href="/dashboard/feed">
              <span className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
                View all trades <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
