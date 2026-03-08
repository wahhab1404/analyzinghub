'use client'

import { motion } from 'framer-motion'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface OptionsCard {
  ticker:    string
  name:      string
  direction: 'CALL' | 'PUT'
  strike:    string
  expiry:    string
  entry:     string
  current:   string
  returnPct: string
  status:    'ACTIVE' | 'TARGET HIT' | 'STOPPED'
  iv:        string
  delta:     string
  analyst:   string
  t1:        string
  stop:      string
}

const OPTIONS: OptionsCard[] = [
  {
    ticker:'SPY', name:'SPDR S&P 500', direction:'CALL', strike:'$590', expiry:'Mar 21',
    entry:'$4.20', current:'$7.82', returnPct:'+86.2%', status:'ACTIVE',
    iv:'18.4%', delta:'0.62', analyst:'Ahmad K.', t1:'$8.50', stop:'$3.20',
  },
  {
    ticker:'AAPL', name:'Apple Inc.', direction:'PUT', strike:'$185', expiry:'Mar 28',
    entry:'$3.10', current:'$4.37', returnPct:'+41.0%', status:'TARGET HIT',
    iv:'22.1%', delta:'-0.45', analyst:'Sara M.', t1:'$4.50', stop:'$2.40',
  },
  {
    ticker:'QQQ', name:'NASDAQ 100 ETF', direction:'CALL', strike:'$510', expiry:'Apr 04',
    entry:'$6.80', current:'$9.45', returnPct:'+38.9%', status:'ACTIVE',
    iv:'19.7%', delta:'0.58', analyst:'Khalid R.', t1:'$11.00', stop:'$5.00',
  },
]

export function OptionsIntelligence() {
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
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#58A6FF]/30 bg-[#58A6FF]/5 rounded-sm mb-3">
              <span className="text-[10px] font-bold text-[#58A6FF] tracking-widest uppercase">Options Intelligence</span>
            </div>
            <h2 className="text-3xl font-black text-foreground tracking-tight">Webull-grade options data</h2>
            <p className="text-muted-foreground text-sm mt-1">Strike, expiry, IV, delta, entry, target — all in one card.</p>
          </div>
          <Link href="/dashboard/feed" className="hidden sm:block">
            <Button variant="outline" size="sm" className="rounded-sm text-xs border-border gap-1.5">
              All Options <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </motion.div>

        {/* Options cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {OPTIONS.map((o, i) => {
            const isCall  = o.direction === 'CALL'
            const isGain  = o.returnPct.startsWith('+')
            const accent  = isCall ? '#3FB950' : '#F85149'
            const accentBg= isCall ? 'rgba(63,185,80,0.10)'  : 'rgba(248,81,73,0.10)'
            const accentBd= isCall ? 'rgba(63,185,80,0.25)'  : 'rgba(248,81,73,0.25)'
            const StatusColor = o.status === 'TARGET HIT' ? '#3FB950' : o.status === 'STOPPED' ? '#F85149' : '#E3B341'

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="bg-card border border-border rounded-sm overflow-hidden hover:border-primary/30 transition-all"
              >
                {/* Card top accent */}
                <div className="h-0.5 w-full" style={{ background: accent }} />

                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-foreground">{o.ticker}</span>
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                          style={{ color: accent, background: accentBg, border: `1px solid ${accentBd}` }}
                        >
                          {isCall ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {o.direction}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{o.name}</div>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={{ color: StatusColor, background: `${StatusColor}18` }}
                    >{o.status}</span>
                  </div>

                  {/* Strike + Expiry */}
                  <div className="flex items-center gap-4 p-3 rounded-lg mb-3" style={{ background: accentBg, border: `1px solid ${accentBd}` }}>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Strike</div>
                      <div className="text-xl font-black num" style={{ color: accent }}>{o.strike}</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Expiry</div>
                      <div className="text-base font-bold text-foreground">{o.expiry}</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">IV</div>
                      <div className="text-base font-bold text-foreground num">{o.iv}</div>
                    </div>
                  </div>

                  {/* Price row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'Entry',   val: o.entry,   dim: true  },
                      { label: 'Current', val: o.current, dim: false },
                      { label: 'Delta',   val: o.delta,   dim: true  },
                    ].map(p => (
                      <div key={p.label} className="bg-muted/20 rounded p-2 border border-border">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{p.label}</div>
                        <div className={`text-xs font-bold num ${p.dim ? 'text-muted-foreground' : 'text-foreground'}`}>{p.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* T1 + Stop */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded" style={{ background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.20)' }}>
                      <span className="text-[10px] text-muted-foreground">T1</span>
                      <span className="text-xs font-bold num text-emerald-500">{o.t1}</span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.20)' }}>
                      <span className="text-[10px] text-muted-foreground">Stop</span>
                      <span className="text-xs font-bold num text-red-400">{o.stop}</span>
                    </div>
                  </div>

                  {/* Return + analyst */}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary to-primary/50" />
                      <span className="text-[11px] font-semibold text-foreground">{o.analyst}</span>
                    </div>
                    <div
                      className="text-sm font-black num"
                      style={{ color: isGain ? '#3FB950' : '#F85149' }}
                    >{o.returnPct}</div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
