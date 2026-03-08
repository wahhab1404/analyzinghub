'use client'

import { motion } from 'framer-motion'
import { BarChart3, Users, TrendingUp, Bell, Trophy, Activity } from 'lucide-react'

const STATS = [
  { icon: BarChart3,  value: '24,800+', label: 'Total Analyses',    color: '#58A6FF', bg: 'rgba(88,166,255,0.10)'  },
  { icon: TrendingUp, value: '94,000+', label: 'Trades Tracked',    color: '#3FB950', bg: 'rgba(63,185,80,0.10)'   },
  { icon: Users,      value: '1,200+',  label: 'Active Analysts',   color: '#A371F7', bg: 'rgba(163,113,247,0.10)' },
  { icon: Bell,       value: '12,400+', label: 'Options Alerts',    color: '#E3B341', bg: 'rgba(227,179,65,0.10)'  },
  { icon: Trophy,     value: '68.4%',   label: 'Reported Win Rate', color: '#F85149', bg: 'rgba(248,81,73,0.10)'   },
  { icon: Activity,   value: '99.9%',   label: 'Platform Uptime',   color: '#3FB950', bg: 'rgba(63,185,80,0.10)'   },
]

export function PlatformStats() {
  return (
    <section className="py-20 relative border-y border-border bg-card/10">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, hsl(var(--primary)), transparent 70%)' }}
      />

      <div className="container relative mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-primary/30 bg-primary/5 rounded-sm mb-4">
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">By the Numbers</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            The platform traders trust
          </h2>
          <p className="text-muted-foreground text-sm mt-2 max-w-lg mx-auto">
            Real metrics, transparent tracking, institutional-grade infrastructure.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STATS.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
                className="bg-card border border-border rounded-sm p-5 text-center hover:border-primary/30 transition-all"
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center mx-auto mb-3"
                  style={{ background: s.bg }}
                >
                  <Icon className="h-4 w-4" style={{ color: s.color }} />
                </div>
                <div className="text-2xl sm:text-3xl font-black num mb-1" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {s.label}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
