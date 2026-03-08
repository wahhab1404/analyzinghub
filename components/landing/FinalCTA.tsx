'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

const PROOF_POINTS = [
  'Free to get started',
  'Auto-validated signals',
  'Real-time Telegram alerts',
  'Analyst performance rankings',
]

export function FinalCTA() {
  const { t } = useTranslation()

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-card/40" />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      {/* Top glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] opacity-[0.08] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, hsl(var(--primary)), transparent 70%)' }}
      />

      <div className="container relative mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/30 bg-primary/5 rounded-sm mb-6">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary tracking-widest uppercase">Ready to level up?</span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight leading-[1.05] mb-4">
            {t.landing.cta.heading}{' '}
            <span className="text-primary">{t.landing.cta.headingHighlight}</span>
          </h2>

          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xl mx-auto mb-8">
            {t.landing.cta.description}
          </p>

          {/* Proof points */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-10">
            {PROOF_POINTS.map(p => (
              <div key={p} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button
                size="lg"
                className="h-12 px-10 rounded-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm tracking-wide gap-2 w-full sm:w-auto"
              >
                {t.landing.cta.joinTrader}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-10 rounded-sm text-sm font-medium border-border hover:border-primary/40 hover:bg-primary/5 w-full sm:w-auto"
              >
                {t.landing.cta.joinAnalyzer}
              </Button>
            </Link>
          </div>

          <p className="mt-6 text-[11px] text-muted-foreground">{t.landing.cta.subtitle}</p>
        </motion.div>
      </div>
    </section>
  )
}
