'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Users, TrendingUp, Bell, Trophy, Lock } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

export function Features() {
  const { t } = useTranslation()

  const features = [
    {
      icon: CheckCircle2,
      titleKey: 'landing.features.autoValidation.title',
      descriptionKey: 'landing.features.autoValidation.description',
      color: 'from-green-500 to-emerald-500'
    },
    {
      icon: Users,
      titleKey: 'landing.features.followAnalysts.title',
      descriptionKey: 'landing.features.followAnalysts.description',
      color: 'from-blue-500 to-cyan-500'
    },
    {
      icon: TrendingUp,
      titleKey: 'landing.features.followSymbols.title',
      descriptionKey: 'landing.features.followSymbols.description',
      color: 'from-primary to-accent'
    },
    {
      icon: Bell,
      titleKey: 'landing.features.smartAlerts.title',
      descriptionKey: 'landing.features.smartAlerts.description',
      color: 'from-orange-500 to-red-500'
    },
    {
      icon: Trophy,
      titleKey: 'landing.features.performanceRankings.title',
      descriptionKey: 'landing.features.performanceRankings.description',
      color: 'from-yellow-500 to-orange-500'
    },
    {
      icon: Lock,
      titleKey: 'landing.features.subscriptionTiers.title',
      descriptionKey: 'landing.features.subscriptionTiers.description',
      color: 'from-chart-1 to-chart-2'
    }
  ]

  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  return (
    <section id="features" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-4xl font-bold text-foreground sm:text-5xl">
            {t.landing.features.heading}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.features.description}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.titleKey}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="group h-full border-border bg-card transition-all hover:border-border/20 hover:shadow-xl hover:-translate-y-1">
                  <CardContent className="p-6">
                    <div className={`mb-4 inline-flex rounded-lg bg-gradient-to-br ${feature.color} p-3`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold text-foreground">
                      {getNestedValue(t, feature.titleKey)}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {getNestedValue(t, feature.descriptionKey)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <p className="text-lg text-muted-foreground italic">
            {t.landing.features.quote}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
