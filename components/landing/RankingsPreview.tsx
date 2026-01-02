'use client'

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/language-context'

const topAnalyzers = [
  { rank: 1, name: 'TradeKing_Pro', wins: 156, losses: 32, winRate: 83.0, badge: 'gold' },
  { rank: 2, name: 'ChartMaster_Alex', wins: 142, losses: 38, winRate: 78.9, badge: 'silver' },
  { rank: 3, name: 'TechAnalyst_Sam', wins: 128, losses: 44, winRate: 74.4, badge: 'bronze' },
  { rank: 4, name: 'CryptoWhale_Joe', wins: 115, losses: 48, winRate: 70.6, badge: null },
  { rank: 5, name: 'SwingTrader_Lisa', wins: 98, losses: 42, winRate: 70.0, badge: null }
]

export function RankingsPreview() {
  const { t } = useTranslation()

  return (
    <section id="rankings" className="py-24 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <div className="mb-4 flex items-center justify-center gap-2">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <h2 className="text-4xl font-bold text-foreground sm:text-5xl">
              {t.landing.rankings.heading}
            </h2>
          </div>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            {t.landing.rankings.subheading}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto max-w-4xl"
        >
          <Card className="border-border bg-card overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/5">
                      <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">{t.landing.rankings.rank}</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">{t.landing.rankings.analyzer}</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-muted-foreground">{t.landing.rankings.wins}</th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-muted-foreground">{t.landing.rankings.losses}</th>
                      <th className="px-6 py-4 text-right text-sm font-semibold text-muted-foreground">{t.landing.rankings.winRate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAnalyzers.map((analyzer, index) => (
                      <motion.tr
                        key={analyzer.rank}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className="border-b border-border hover:bg-muted/5 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-muted-foreground">#{analyzer.rank}</span>
                            {analyzer.badge === 'gold' && <Trophy className="h-5 w-5 text-yellow-500" />}
                            {analyzer.badge === 'silver' && <Trophy className="h-5 w-5 text-muted-foreground" />}
                            {analyzer.badge === 'bronze' && <Trophy className="h-5 w-5 text-orange-600" />}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent" />
                            <div>
                              <p className="font-semibold text-foreground">{analyzer.name}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <TrendingUp className="h-3 w-3" />
                                <span>{t.landing.rankings.thisWeek}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge className="bg-green-500/20 text-green-500">{analyzer.wins}</Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge className="bg-red-500/20 text-red-500">{analyzer.losses}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-lg font-bold text-foreground">{analyzer.winRate}%</span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 text-center"
          >
            <Link href="/dashboard/feed">
              <Button size="lg" variant="outline" className="border-border text-foreground hover:bg-muted/10">
                {t.landing.rankings.viewFullRankings}
                <ArrowRight className="ms-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
