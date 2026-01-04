'use client'

import { LeaderboardView } from '@/components/rankings/LeaderboardView'
import { useTranslation } from '@/lib/i18n/language-context'

export default function RankingsPage() {
  const { t } = useTranslation()

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t.leaderboard.leaderboards}</h1>
          <p className="text-muted-foreground mt-2">
            {t.leaderboard.topPerformers}
          </p>
        </div>

        <LeaderboardView />
      </div>
    </div>
  )
}
