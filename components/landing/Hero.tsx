'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, TrendingUp, Users, Bell, Shield } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { AnalysisCardPreview } from './AnalysisCardPreview'
import { useTranslation } from '@/lib/i18n/language-context'

export function Hero() {
  const { t } = useTranslation()

  return (
    <section className="relative overflow-hidden pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 bg-background">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-8 sm:mb-12"
        >
          <Image
            src="/analyzer-logo.png"
            alt="AnalyzingHub Logo"
            width={400}
            height={133}
            className="h-28 w-auto sm:h-36 md:h-44 drop-shadow-2xl"
            priority
          />
        </motion.div>

        <div className="grid gap-8 sm:gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-sm sm:text-base">
              {t.landing.hero.badge}
            </Badge>

            <h1 className="mb-4 sm:mb-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-tight tracking-tight text-foreground">
              {t.landing.hero.heading}{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-chart-3 bg-clip-text text-transparent">
                {t.landing.hero.headingHighlight}
              </span>
            </h1>

            <p className="mb-6 sm:mb-8 text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
              {t.landing.hero.subheading}
            </p>

            <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-primary to-accent text-white hover:opacity-90 text-base sm:text-lg px-6 sm:px-8 h-12 sm:h-14">
                  {t.landing.hero.getStarted}
                  <ArrowRight className="ms-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/dashboard/feed" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 h-12 sm:h-14">
                  {t.landing.hero.exploreAnalyses}
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <div className="flex items-center gap-2 sm:gap-3 p-2">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t.landing.hero.autoValidated}</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 p-2">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t.landing.hero.performanceRankings}</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 p-2">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-accent flex-shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t.landing.hero.followSymbols}</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 p-2">
                <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-orange-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">{t.landing.hero.realTimeAlerts}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex justify-center mt-8 lg:mt-0"
          >
            <div className="w-full max-w-md lg:max-w-full">
              <AnalysisCardPreview />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 sm:mt-16 flex items-center justify-center gap-2 text-center px-4"
        >
          <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-xs sm:text-sm text-muted-foreground">
            {t.landing.hero.disclaimer}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
