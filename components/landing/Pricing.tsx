'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

export function Pricing() {
  const { t } = useTranslation()

  const plans = [
    {
      name: t.landing.pricing.free.name,
      price: t.landing.pricing.free.price,
      description: t.landing.pricing.free.description,
      features: t.landing.pricing.free.features,
      cta: t.landing.pricing.free.cta,
      href: '/register',
      popular: false
    },
    {
      name: t.landing.pricing.proTrader.name,
      price: t.landing.pricing.proTrader.price,
      description: t.landing.pricing.proTrader.description,
      features: t.landing.pricing.proTrader.features,
      cta: t.landing.pricing.proTrader.cta,
      href: '/register',
      popular: true
    },
    {
      name: t.landing.pricing.analyzerPro.name,
      price: t.landing.pricing.analyzerPro.price,
      description: t.landing.pricing.analyzerPro.description,
      features: t.landing.pricing.analyzerPro.features,
      cta: t.landing.pricing.analyzerPro.cta,
      href: '/register',
      popular: false
    }
  ]

  return (
    <section id="pricing" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 text-4xl font-bold text-foreground sm:text-5xl">
            {t.landing.pricing.heading}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.pricing.subheading}
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className={`relative h-full border-border bg-card ${plan.popular ? 'ring-2 ring-primary' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-primary to-accent text-foreground">
                      {t.pricingPage.mostPopular}
                    </Badge>
                  </div>
                )}
                <CardContent className="p-8">
                  <div className="mb-6">
                    <h3 className="mb-2 text-2xl font-bold text-foreground">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                    <div className="mb-2">
                      <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                      {plan.price !== t.landing.pricing.comingSoon && <span className="text-muted-foreground">/{t.landing.pricing.perMonth}</span>}
                    </div>
                  </div>

                  <ul className="mb-8 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={plan.href}>
                    <Button
                      className={`w-full ${plan.popular ? 'bg-gradient-to-r from-primary to-accent text-foreground hover:from-primary/80 hover:to-accent/80' : 'bg-muted/10 text-foreground hover:bg-muted/20'}`}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 text-center"
        >
          <p className="text-muted-foreground">
            {t.landing.pricing.footer}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
