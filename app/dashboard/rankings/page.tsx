import { LeaderboardView } from '@/components/rankings/LeaderboardView'

export default function RankingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Rankings</h1>
          <p className="text-muted-foreground mt-2">
            Top performers ranked by points, accuracy, and quality engagement
          </p>
        </div>

        <LeaderboardView />
      </div>
    </div>
  )
}
