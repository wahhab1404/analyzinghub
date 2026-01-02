'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Users, CheckCircle2, Bell } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      icon: FileText,
      step: t.landing.howItWorks.step1
    },
    {
      icon: Users,
      step: t.landing.howItWorks.step2
    },
    {
      icon: CheckCircle2,
      step: t.landing.howItWorks.step3
    },
    {
      icon: Bell,
      step: t.landing.howItWorks.step4
    }
  ]

  return (
    <section id="how-it-works" className="py-24 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-4xl font-bold text-foreground sm:text-5xl">
            {t.landing.howItWorks.heading}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.howItWorks.description}
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative"
              >
                {index < steps.length - 1 && (
                  <div className="absolute left-1/2 top-16 hidden h-1 w-full bg-gradient-to-r from-primary/50 to-accent/50 lg:block" />
                )}

                <Card className="relative h-full border-border bg-card">
                  <CardContent className="p-6 text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="mb-2 text-sm font-mono text-primary">{step.step.number}</div>
                    <h3 className="mb-3 text-xl font-bold text-foreground">{step.step.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{step.step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
