'use client'

import { motion } from 'framer-motion'
import { BarChart3, Shield, Zap, Bell } from 'lucide-react'

const FEATURES = [
  {
    icon: BarChart3,
    color: '#58A6FF',
    colorBg: 'rgba(88,166,255,0.10)',
    colorBd: 'rgba(88,166,255,0.25)',
    title: 'Professional Market Analyses',
    desc: 'Deep institutional-grade analyses on indices, stocks, and options — published by verified analysts with real track records.',
    tag: 'Analyses',
  },
  {
    icon: Zap,
    color: '#3FB950',
    colorBg: 'rgba(63,185,80,0.10)',
    colorBd: 'rgba(63,185,80,0.25)',
    title: 'Live Trade Tracking',
    desc: 'Every trade is auto-validated against live market data. Entry, target hits, stop losses — all timestamped and audited.',
    tag: 'Real-time',
  },
  {
    icon: Shield,
    color: '#E3B341',
    colorBg: 'rgba(227,179,65,0.10)',
    colorBd: 'rgba(227,179,65,0.25)',
    title: 'Options Contract Intelligence',
    desc: 'Full options analytics: strike, expiry, Greeks, bid/ask, IV, and live P/L tracking for every open contract.',
    tag: 'Options',
  },
  {
    icon: Bell,
    color: '#F85149',
    colorBg: 'rgba(248,81,73,0.10)',
    colorBd: 'rgba(248,81,73,0.25)',
    title: 'Analyst Performance Metrics',
    desc: 'Win rate, avg return, trade frequency, best/worst trade — transparent leaderboards so you follow the right people.',
    tag: 'Analytics',
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 relative">
      <div className="container mx-auto px-4 sm:px-6">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5 rounded-sm mb-4">
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Why AnalyzingHub</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight mb-3">
            Everything a serious trader needs
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            From raw market analyses to verified trade signals and options intelligence — one platform, institutional quality.
          </p>
        </motion.div>

        {/* 2×2 feature grid */}
        <div className="grid sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group bg-card border border-border rounded-sm p-6 hover:border-[color:var(--f-bd)] transition-all"
                style={{ '--f-bd': f.colorBd } as React.CSSProperties}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className="flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ background: f.colorBg, border: `1px solid ${f.colorBd}` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: f.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ color: f.color, background: f.colorBg }}
                      >{f.tag}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
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
