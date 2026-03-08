import { Navigation }          from '@/components/landing/Navigation'
import { Hero }                from '@/components/landing/Hero'
import { MarketSnapshot }      from '@/components/landing/MarketSnapshot'
import { Features }            from '@/components/landing/Features'
import { LatestAnalyses }      from '@/components/landing/LatestAnalyses'
import { ActiveTrades }        from '@/components/landing/ActiveTrades'
import { OptionsIntelligence } from '@/components/landing/OptionsIntelligence'
import { RankingsPreview }     from '@/components/landing/RankingsPreview'
import { PlatformStats }       from '@/components/landing/PlatformStats'
import { Pricing }             from '@/components/landing/Pricing'
import { FAQ }                 from '@/components/landing/FAQ'
import { FinalCTA }            from '@/components/landing/FinalCTA'
import { Footer }              from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* 1. Hero — two-column: headline + dashboard mockup */}
        <Hero />

        {/* 2. Market Snapshot — SPX/NDX/DJI/VIX/AAPL/NVDA cards */}
        <MarketSnapshot />

        {/* 3. Why AnalyzingHub — 4 feature pillars */}
        <Features />

        {/* 4. Latest Analyses — grid of analysis cards */}
        <LatestAnalyses />

        {/* 5. Active Trades — live trade table */}
        <ActiveTrades />

        {/* 6. Options Intelligence — Webull-style options cards */}
        <OptionsIntelligence />

        {/* 7. Top Analysts — leaderboard cards */}
        <RankingsPreview />

        {/* 8. Platform Stats — credibility numbers */}
        <PlatformStats />

        {/* 9. Pricing plans */}
        <Pricing />

        {/* 10. FAQ */}
        <FAQ />

        {/* 11. Final CTA */}
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
