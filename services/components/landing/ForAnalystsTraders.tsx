'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, DollarSign, Shield, Search, Filter, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

export function ForAnalystsTraders() {
  const { t } = useTranslation()

  return (
    <section className="py-24 relative">
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
            {t.landing.forAnalysts.heading}
          </h2>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.forAnalysts.description}
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="h-full border-border bg-card">
              <CardContent className="p-8">
                <div className="mb-6">
                  <div className="mb-4 inline-flex rounded-lg bg-gradient-to-br from-primary to-accent p-3">
                    <BarChart3 className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-2 text-3xl font-bold text-foreground">
                    {t.landing.forAnalysts.analysts.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {t.landing.forAnalysts.analysts.subtitle}
                  </p>
                </div>

                <ul className="mb-8 space-y-4">
                  <li className="flex items-start gap-3">
                    <Shield className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.analysts.feature1.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.analysts.feature1.description}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <DollarSign className="mt-1 h-5 w-5 flex-shrink-0 text-green-500" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.analysts.feature2.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.analysts.feature2.description}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <BarChart3 className="mt-1 h-5 w-5 flex-shrink-0 text-accent" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.analysts.feature3.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.analysts.feature3.description}
                      </p>
                    </div>
                  </li>
                </ul>

                <Link href="/register">
                  <Button className="w-full bg-gradient-to-r from-primary to-accent text-white hover:opacity-90">
                    {t.landing.forAnalysts.analysts.becomeAnalyzer}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Card className="h-full border-border bg-card">
              <CardContent className="p-8">
                <div className="mb-6">
                  <div className="mb-4 inline-flex rounded-lg bg-gradient-to-br from-primary to-accent p-3">
                    <Search className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-2 text-3xl font-bold text-foreground">
                    {t.landing.forAnalysts.traders.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {t.landing.forAnalysts.traders.subtitle}
                  </p>
                </div>

                <ul className="mb-8 space-y-4">
                  <li className="flex items-start gap-3">
                    <Filter className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.traders.feature1.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.traders.feature1.description}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-orange-500" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.traders.feature2.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.traders.feature2.description}
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Search className="mt-1 h-5 w-5 flex-shrink-0 text-accent" />
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {t.landing.forAnalysts.traders.feature3.title}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t.landing.forAnalysts.traders.feature3.description}
                      </p>
                    </div>
                  </li>
                </ul>

                <Link href="/register">
                  <Button className="w-full bg-gradient-to-r from-primary to-accent text-white hover:opacity-90">
                    {t.landing.forAnalysts.traders.joinTrader}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
