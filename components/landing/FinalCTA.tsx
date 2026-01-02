'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

export function FinalCTA() {
  const { t } = useTranslation()

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <TrendingUp className="h-8 w-8 text-white" />
          </div>

          <h2 className="mb-6 text-4xl font-bold text-foreground sm:text-5xl lg:text-6xl">
            {t.landing.cta.heading}{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-green-500 bg-clip-text text-transparent">
              {t.landing.cta.headingHighlight}
            </span>
          </h2>

          <p className="mb-10 text-xl text-muted-foreground leading-relaxed">
            {t.landing.cta.description}
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 text-lg px-8">
                {t.landing.cta.joinTrader}
                <ArrowRight className="ms-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="border-border text-foreground hover:bg-muted/10 text-lg px-8">
                {t.landing.cta.joinAnalyzer}
              </Button>
            </Link>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 text-sm text-muted-foreground"
          >
            {t.landing.cta.subtitle}
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}
